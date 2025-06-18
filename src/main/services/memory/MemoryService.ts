import { Client, createClient } from '@libsql/client'
import Embeddings from '@main/embeddings/Embeddings'
import type {
  AddMemoryOptions,
  AssistantMessage,
  MemoryConfig,
  MemoryHistoryItem,
  MemoryItem,
  MemoryListOptions,
  MemorySearchOptions
} from '@types'
import crypto from 'crypto'
import { app } from 'electron'
import logger from 'electron-log'
import path from 'path'

export interface EmbeddingOptions {
  model: string
  provider: string
  apiKey: string
  apiVersion?: string
  baseURL: string
  dimensions?: number
  batchSize?: number
}

export interface VectorSearchOptions {
  limit?: number
  threshold?: number
  userId?: string
  agentId?: string
  filters?: Record<string, any>
}

export interface SearchResult {
  memories: MemoryItem[]
  count: number
  error?: string
}

export class MemoryService {
  private static instance: MemoryService | null = null
  private db: Client | null = null
  private isInitialized = false
  private embeddings: Embeddings | null = null
  private config: MemoryConfig | null = null

  // Embedding cache management
  private embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>()
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_CACHE_SIZE = 10000

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  public static reload(): MemoryService {
    if (MemoryService.instance) {
      MemoryService.instance.close()
    }
    MemoryService.instance = new MemoryService()
    return MemoryService.instance
  }

  /**
   * Initialize the database connection and create tables
   */
  private async init(): Promise<void> {
    if (this.isInitialized && this.db) {
      return
    }

    try {
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'memories.db')

      this.db = createClient({
        url: `file:${dbPath}`,
        intMode: 'number'
      })

      // Create tables
      await this.createTables()
      this.isInitialized = true
      logger.info('Memory database initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize memory database:', error)
      throw new Error(
        `Memory database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Create memories table with native vector support
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        memory TEXT NOT NULL,
        hash TEXT UNIQUE,
        embedding F32_BLOB(1536), -- Native vector column (1536 dimensions for OpenAI embeddings)
        metadata TEXT, -- JSON string
        user_id TEXT,
        agent_id TEXT,
        run_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0
      )
    `)

    // Create memory history table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS memory_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT,
        action TEXT NOT NULL, -- ADD, UPDATE, DELETE
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        FOREIGN KEY (memory_id) REFERENCES memories (id)
      )
    `)

    // Create indexes
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id)')
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)')
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)')
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash)')
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id)')

    // Create vector index for similarity search
    try {
      await this.db.execute('CREATE INDEX IF NOT EXISTS idx_memories_vector ON memories (libsql_vector_idx(embedding))')
    } catch (error) {
      // Vector index might not be supported in all versions
      logger.warn('Failed to create vector index, falling back to non-indexed search:', error)
    }
  }

  /**
   * Add new memories from messages
   */
  public async add(messages: string | AssistantMessage[], options: AddMemoryOptions): Promise<SearchResult> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const { userId, agentId, runId, metadata } = options

    try {
      // Convert messages to memory strings
      const memoryStrings = Array.isArray(messages)
        ? messages.map((m) => (typeof m === 'string' ? m : m.content))
        : [messages]
      const addedMemories: MemoryItem[] = []

      for (const memory of memoryStrings) {
        const trimmedMemory = memory.trim()
        if (!trimmedMemory) continue

        // Generate hash for deduplication
        const hash = crypto.createHash('sha256').update(trimmedMemory).digest('hex')

        // Check if memory already exists
        const existing = await this.db.execute({
          sql: 'SELECT id FROM memories WHERE hash = ? AND is_deleted = 0',
          args: [hash]
        })

        if (existing.rows.length > 0) {
          logger.info(`Memory already exists with hash: ${hash}`)
          continue
        }

        // Generate embedding if model is configured
        let embedding: number[] | null = null
        if (this.config?.embedderModel) {
          try {
            embedding = await this.generateEmbedding(trimmedMemory)
          } catch (error) {
            logger.error('Failed to generate embedding:', error)
            // Continue without embedding
          }
        }

        // Insert new memory
        const id = crypto.randomUUID()
        const now = new Date().toISOString()

        await this.db.execute({
          sql: `
            INSERT INTO memories (id, memory, hash, embedding, metadata, user_id, agent_id, run_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            id,
            trimmedMemory,
            hash,
            embedding ? this.embeddingToVector(embedding) : null,
            metadata ? JSON.stringify(metadata) : null,
            userId || null,
            agentId || null,
            runId || null,
            now,
            now
          ]
        })

        // Add to history
        await this.addHistory(id, null, trimmedMemory, 'ADD')

        addedMemories.push({
          id,
          memory: trimmedMemory,
          hash,
          createdAt: now,
          updatedAt: now,
          metadata
        })
      }

      return {
        memories: addedMemories,
        count: addedMemories.length
      }
    } catch (error) {
      logger.error('Failed to add memories:', error)
      return {
        memories: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Search memories using text or vector similarity
   */
  public async search(query: string, options: MemorySearchOptions = {}): Promise<SearchResult> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const { limit = 10, userId, agentId, filters = {} } = options

    try {
      // If we have an embedder model configured, use vector search
      if (this.config?.embedderModel) {
        try {
          const queryEmbedding = await this.generateEmbedding(query)
          return await this.hybridSearch(query, queryEmbedding, { limit, userId, agentId, filters })
        } catch (error) {
          logger.error('Vector search failed, falling back to text search:', error)
        }
      }

      // Fallback to text search
      const conditions: string[] = ['m.is_deleted = 0']
      const params: any[] = []

      // Add search conditions
      conditions.push('(m.memory LIKE ? OR m.memory LIKE ?)')
      params.push(`%${query}%`, `%${query.split(' ').join('%')}%`)

      if (userId) {
        conditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        conditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      // Add custom filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          conditions.push(`json_extract(m.metadata, '$.${key}') = ?`)
          params.push(value)
        }
      }

      const whereClause = conditions.join(' AND ')
      params.push(limit)

      const result = await this.db.execute({
        sql: `
          SELECT 
            m.id,
            m.memory,
            m.hash,
            m.metadata,
            m.user_id,
            m.agent_id,
            m.run_id,
            m.created_at,
            m.updated_at
          FROM memories m
          WHERE ${whereClause}
          ORDER BY m.created_at DESC
          LIMIT ?
        `,
        args: params
      })

      const memories: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
      }))

      return {
        memories,
        count: memories.length
      }
    } catch (error) {
      logger.error('Search failed:', error)
      return {
        memories: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * List all memories with optional filters
   */
  public async list(options: MemoryListOptions = {}): Promise<SearchResult> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const { userId, agentId, limit = 100 } = options
    const offset = 0 // Default offset since it's not in MemoryListOptions

    try {
      const conditions: string[] = ['m.is_deleted = 0']
      const params: any[] = []

      if (userId) {
        conditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        conditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      const whereClause = conditions.join(' AND ')

      // Get total count
      const countResult = await this.db.execute({
        sql: `SELECT COUNT(*) as total FROM memories m WHERE ${whereClause}`,
        args: params
      })
      const totalCount = (countResult.rows[0] as any).total as number

      // Get paginated results
      params.push(limit, offset)
      const result = await this.db.execute({
        sql: `
          SELECT 
            m.id,
            m.memory,
            m.hash,
            m.metadata,
            m.user_id,
            m.agent_id,
            m.run_id,
            m.created_at,
            m.updated_at
          FROM memories m
          WHERE ${whereClause}
          ORDER BY m.created_at DESC
          LIMIT ? OFFSET ?
        `,
        args: params
      })

      const memories: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
      }))

      return {
        memories,
        count: totalCount
      }
    } catch (error) {
      logger.error('List failed:', error)
      return {
        memories: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Delete a memory (soft delete)
   */
  public async delete(id: string): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    try {
      // Get current memory value for history
      const current = await this.db.execute({
        sql: 'SELECT memory FROM memories WHERE id = ? AND is_deleted = 0',
        args: [id]
      })

      if (current.rows.length === 0) {
        throw new Error('Memory not found')
      }

      const currentMemory = (current.rows[0] as any).memory as string

      // Soft delete
      await this.db.execute({
        sql: 'UPDATE memories SET is_deleted = 1, updated_at = ? WHERE id = ?',
        args: [new Date().toISOString(), id]
      })

      // Add to history
      await this.addHistory(id, currentMemory, null, 'DELETE')

      logger.info(`Memory deleted: ${id}`)
    } catch (error) {
      logger.error('Delete failed:', error)
      throw new Error(`Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update a memory
   */
  public async update(id: string, memory: string, metadata?: Record<string, any>): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    try {
      // Get current memory
      const current = await this.db.execute({
        sql: 'SELECT memory, metadata FROM memories WHERE id = ? AND is_deleted = 0',
        args: [id]
      })

      if (current.rows.length === 0) {
        throw new Error('Memory not found')
      }

      const row = current.rows[0] as any
      const previousMemory = row.memory as string
      const previousMetadata = row.metadata ? JSON.parse(row.metadata as string) : {}

      // Generate new hash
      const hash = crypto.createHash('sha256').update(memory.trim()).digest('hex')

      // Generate new embedding if model is configured
      let embedding: number[] | null = null
      if (this.config?.embedderModel) {
        try {
          embedding = await this.generateEmbedding(memory)
        } catch (error) {
          logger.error('Failed to generate embedding for update:', error)
        }
      }

      // Merge metadata
      const mergedMetadata = { ...previousMetadata, ...metadata }

      // Update memory
      await this.db.execute({
        sql: `
          UPDATE memories 
          SET memory = ?, hash = ?, embedding = ?, metadata = ?, updated_at = ?
          WHERE id = ?
        `,
        args: [
          memory.trim(),
          hash,
          embedding ? this.embeddingToVector(embedding) : null,
          JSON.stringify(mergedMetadata),
          new Date().toISOString(),
          id
        ]
      })

      // Add to history
      await this.addHistory(id, previousMemory, memory, 'UPDATE')

      logger.info(`Memory updated: ${id}`)
    } catch (error) {
      logger.error('Update failed:', error)
      throw new Error(`Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get memory history
   */
  public async get(memoryId: string): Promise<MemoryHistoryItem[]> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    try {
      const result = await this.db.execute({
        sql: `
          SELECT * FROM memory_history 
          WHERE memory_id = ? AND is_deleted = 0
          ORDER BY created_at DESC
        `,
        args: [memoryId]
      })

      return result.rows.map((row: any) => ({
        id: row.id as number,
        memoryId: row.memory_id as string,
        previousValue: row.previous_value as string | undefined,
        newValue: row.new_value as string,
        action: row.action as 'ADD' | 'UPDATE' | 'DELETE',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: row.is_deleted === 1
      }))
    } catch (error) {
      logger.error('Get history failed:', error)
      throw new Error(`Failed to get memory history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Reset all memories
   */
  public async reset(): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    try {
      await this.db.execute('DELETE FROM memory_history')
      await this.db.execute('DELETE FROM memories')
      logger.info('All memories reset')
    } catch (error) {
      logger.error('Reset failed:', error)
      throw new Error(`Failed to reset memories: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Update configuration
   */
  public setConfig(config: MemoryConfig): void {
    this.config = config
    // Reset embeddings instance when config changes
    this.embeddings = null
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
      this.isInitialized = false
    }
  }

  // ========== EMBEDDING OPERATIONS (Previously EmbeddingService) ==========

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.config?.embedderModel) {
      throw new Error('Embedder model not configured')
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text, this.config.embedderModel.id)
    const cached = this.embeddingCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.embedding
    }

    try {
      // Initialize embeddings instance if needed
      if (!this.embeddings) {
        const model = this.config.embedderModel
        const provider = this.config.embedderProvider

        if (!provider) {
          throw new Error('Embedder provider not configured')
        }

        this.embeddings = new Embeddings({
          id: model.id,
          model: model.id,
          provider: provider.id,
          apiKey: provider.apiKey || '',
          baseURL: provider.apiHost || '',
          apiVersion: provider.apiVersion,
          dimensions: this.config.embedderDimensions || this.getModelDimensions(model.id)
        })
        await this.embeddings.init()
      }

      const embedding = await this.embeddings.embedQuery(text)

      // Cache the result
      this.setCacheEntry(cacheKey, embedding)

      return embedding
    } catch (error) {
      logger.error('Embedding generation failed:', error)
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.config?.embedderModel) {
      throw new Error('Embedder model not configured')
    }

    const embeddings: number[][] = []
    const uncachedTexts: string[] = []
    const uncachedIndexes: number[] = []

    // Check cache for existing embeddings
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i]
      const cacheKey = this.getCacheKey(text, this.config.embedderModel.id)
      const cached = this.embeddingCache.get(cacheKey)

      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        embeddings[i] = cached.embedding
      } else {
        uncachedTexts.push(text)
        uncachedIndexes.push(i)
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      try {
        if (!this.embeddings) {
          const model = this.config.embedderModel
          const provider = this.config.embedderProvider

          if (!provider) {
            throw new Error('Embedder provider not configured')
          }

          this.embeddings = new Embeddings({
            id: model.id,
            model: model.id,
            provider: provider.id,
            apiKey: provider.apiKey || '',
            baseURL: provider.apiHost || '',
            apiVersion: provider.apiVersion,
            dimensions: this.config.embedderDimensions || this.getModelDimensions(model.id)
          })
          await this.embeddings.init()
        }

        const newEmbeddings = await this.embeddings.embedDocuments(uncachedTexts)

        // Cache and assign results
        for (let i = 0; i < uncachedTexts.length; i++) {
          const text = uncachedTexts[i]
          const embedding = newEmbeddings[i]
          const originalIndex = uncachedIndexes[i]

          const cacheKey = this.getCacheKey(text, this.config.embedderModel.id)
          this.setCacheEntry(cacheKey, embedding)

          embeddings[originalIndex] = embedding
        }
      } catch (error) {
        logger.error('Batch embedding generation failed:', error)
        throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return embeddings
  }

  /**
   * Generate cache key for text and model
   */
  private getCacheKey(text: string, modelId: string): string {
    const combined = `${text}:${modelId}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return `emb_${hash.toString(36)}`
  }

  /**
   * Set cache entry with size management
   */
  private setCacheEntry(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.embeddingCache.keys().next().value
      if (oldestKey) {
        this.embeddingCache.delete(oldestKey)
      }
    }

    this.embeddingCache.set(key, {
      embedding,
      timestamp: Date.now()
    })
  }

  /**
   * Get model dimensions
   */
  private getModelDimensions(modelId: string): number {
    const dimensionMap: { [key: string]: number } = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
      'nomic-embed-text': 768,
      'mxbai-embed-large': 1024
    }

    return dimensionMap[modelId] || 1536
  }

  // ========== VECTOR SEARCH OPERATIONS (Previously VectorSearch) ==========

  /**
   * Convert embedding array to libsql vector format
   */
  private embeddingToVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`
  }

  /**
   * Convert libsql vector to embedding array
   */
  private vectorToEmbedding(vector: string): number[] {
    return JSON.parse(vector)
  }

  /**
   * Search memories by vector similarity
   */
  private async vectorSearch(embedding: number[], options: VectorSearchOptions = {}): Promise<SearchResult> {
    if (!this.db) throw new Error('Database not initialized')

    const { limit = 10, threshold = 0.0, userId, agentId } = options

    try {
      const queryVector = this.embeddingToVector(embedding)

      const conditions: string[] = ['m.is_deleted = 0', 'm.embedding IS NOT NULL']
      const params: any[] = [queryVector]

      if (userId) {
        conditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        conditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      const whereClause = conditions.join(' AND ')

      const query = `
        SELECT 
          m.id,
          m.memory,
          m.hash,
          m.metadata,
          m.user_id,
          m.agent_id,
          m.run_id,
          m.created_at,
          m.updated_at,
          vector_distance_cos(m.embedding, vector32(?)) as distance,
          (1 - vector_distance_cos(m.embedding, vector32(?))) as similarity
        FROM memories m
        WHERE ${whereClause}
        AND (1 - vector_distance_cos(m.embedding, vector32(?))) >= ?
        ORDER BY similarity DESC
        LIMIT ?
      `

      params.push(queryVector, queryVector, threshold, limit)

      const result = await this.db.execute({
        sql: query,
        args: params
      })

      const memories: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        score: row.similarity as number
      }))

      return {
        memories,
        count: memories.length
      }
    } catch (error) {
      logger.error('Vector search failed:', error)
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Hybrid search combining text and vector similarity
   */
  private async hybridSearch(
    query: string,
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<SearchResult> {
    if (!this.db) throw new Error('Database not initialized')

    const { limit = 10, threshold = 0.0, userId, agentId } = options

    try {
      const queryVector = this.embeddingToVector(queryEmbedding)

      const conditions: string[] = ['m.is_deleted = 0']
      const params: any[] = []

      // Add text search parameters
      const exactMatch = `%${query}%`
      const fuzzyMatch = `%${query.split(' ').join('%')}%`

      params.push(queryVector, queryVector, exactMatch, fuzzyMatch, queryVector, exactMatch, fuzzyMatch)

      if (userId) {
        conditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        conditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      const whereClause = conditions.join(' AND ')

      const hybridQuery = `
        SELECT 
          m.id,
          m.memory,
          m.hash,
          m.metadata,
          m.user_id,
          m.agent_id,
          m.run_id,
          m.created_at,
          m.updated_at,
          CASE 
            WHEN m.embedding IS NULL THEN 2.0
            ELSE vector_distance_cos(m.embedding, vector32(?))
          END as distance,
          CASE 
            WHEN m.embedding IS NULL THEN 0.0
            ELSE (1 - vector_distance_cos(m.embedding, vector32(?)))
          END as vector_similarity,
          CASE 
            WHEN m.memory LIKE ? THEN 1.0
            WHEN m.memory LIKE ? THEN 0.8
            ELSE 0.0
          END as text_similarity,
          (
            CASE 
              WHEN m.embedding IS NULL THEN 0.0
              ELSE (1 - vector_distance_cos(m.embedding, vector32(?))) * 0.7
            END +
            CASE 
              WHEN m.memory LIKE ? THEN 1.0 * 0.3
              WHEN m.memory LIKE ? THEN 0.8 * 0.3
              ELSE 0.0
            END
          ) as combined_score
        FROM memories m
        WHERE ${whereClause}
        HAVING combined_score >= ?
        ORDER BY combined_score DESC
        LIMIT ?
      `

      params.push(threshold, limit)

      const result = await this.db.execute({
        sql: hybridQuery,
        args: params
      })

      const memories: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        score: row.combined_score as number
      }))

      return {
        memories,
        count: memories.length
      }
    } catch (error) {
      logger.error('Hybrid search failed:', error)
      throw new Error(`Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Find similar memories for deduplication
   */
  private async findSimilarMemories(
    embedding: number[],
    threshold: number = 0.95,
    excludeId?: string
  ): Promise<MemoryItem[]> {
    if (!this.db) throw new Error('Database not initialized')

    try {
      const queryVector = this.embeddingToVector(embedding)

      let query = `
        SELECT 
          m.id,
          m.memory,
          m.hash,
          m.metadata,
          m.user_id,
          m.agent_id,
          m.run_id,
          m.created_at,
          m.updated_at,
          (1 - vector_distance_cos(m.embedding, vector32(?))) as similarity
        FROM memories m
        WHERE m.is_deleted = 0
        AND m.embedding IS NOT NULL
        AND (1 - vector_distance_cos(m.embedding, vector32(?))) >= ?
      `

      const params: any[] = [queryVector, queryVector, threshold]

      if (excludeId) {
        query += ' AND m.id != ?'
        params.push(excludeId)
      }

      query += ' ORDER BY similarity DESC LIMIT 50'

      const result = await this.db.execute({
        sql: query,
        args: params
      })

      return result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        score: row.similarity as number
      }))
    } catch (error) {
      logger.error('Similar memories search failed:', error)
      throw new Error(`Similar memories search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========== HELPER METHODS ==========

  /**
   * Add entry to memory history
   */
  private async addHistory(
    memoryId: string,
    previousValue: string | null,
    newValue: string | null,
    action: 'ADD' | 'UPDATE' | 'DELETE'
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const now = new Date().toISOString()
    await this.db.execute({
      sql: `
        INSERT INTO memory_history (memory_id, previous_value, new_value, action, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [memoryId, previousValue, newValue, action, now, now]
    })
  }

  /**
   * Clear expired cache entries
   */
  public clearExpiredCache(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, value] of this.embeddingCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        expiredKeys.push(key)
      }
    }

    for (const key of expiredKeys) {
      this.embeddingCache.delete(key)
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.MAX_CACHE_SIZE
    }
  }

  /**
   * Clear all cached embeddings
   */
  public clearCache(): void {
    this.embeddingCache.clear()
  }
}

export default MemoryService
