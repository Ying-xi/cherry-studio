import { Client, createClient } from '@libsql/client'
import {
  AddMemoryOptions,
  AssistantMessage,
  MemoryConfig,
  MemoryHistoryItem,
  MemoryItem,
  MemoryListOptions,
  MemorySearchOptions,
  MemorySearchResult
} from '@types'
import crypto from 'crypto'
import { app } from 'electron'
import path from 'path'
import { v4 as uuid4 } from 'uuid'

import { EmbeddingService } from './EmbeddingService'
import { VectorSearch } from './VectorSearch'

class MemoryService {
  private static instance: MemoryService | null = null
  private config: MemoryConfig | null = null
  private client: Client
  private embeddingService: EmbeddingService
  private vectorSearchService: VectorSearch

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  /**
   * Update memory service configuration
   */
  public async updateConfig(config: MemoryConfig): Promise<void> {
    try {
      this.config = config
      MemoryService.instance = this // Update singleton instance
      console.log('Memory service configuration updated successfully')
    } catch (error) {
      console.error('Failed to update memory service configuration:', error)
      throw error
    }
  }

  public constructor() {
    try {
      // Create database file in userData directory
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'memory.db')

      this.client = createClient({
        url: `file:${dbPath}`
      })

      // Initialize vector search and embedding service
      this.vectorSearchService = new VectorSearch(this.client)
      this.embeddingService = new EmbeddingService()

      console.log('MemoryService initialized successfully')
    } catch (error) {
      console.error('Failed to initialize MemoryService:', error)
      throw error
    }
  }

  private async createTables(): Promise<void> {
    if (!this.client) throw new Error('Database client not initialized')

    // Create memories table with native vector support
    // Using F32_BLOB without dimension specification to support different embedding models
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        memory TEXT NOT NULL,
        hash TEXT UNIQUE,
        embedding F32_BLOB,
        metadata TEXT,
        user_id TEXT,
        agent_id TEXT,
        run_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0
      )
    `)

    // Create memory history table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS memory_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT,
        action TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        FOREIGN KEY (memory_id) REFERENCES memories (id)
      )
    `)

    // Create indexes including vector index
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id)`)

    // Create vector index for similarity search
    // try {
    //   await this.client.execute(
    //     `CREATE INDEX IF NOT EXISTS idx_memories_vector ON memories (libsql_vector_idx(embedding))`
    //   )
    // } catch (error) {
    //   console.warn('Vector indexing not supported in this libsql version:', error)
    // }
  }

  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
  }

  private checkInitialized(): void {
    if (!this.config) {
      throw new Error('MemoryService not initialized. Call updateConfig() first.')
    }
  }

  public async add(messages: string | AssistantMessage[], options: AddMemoryOptions): Promise<MemorySearchResult> {
    this.checkInitialized()

    try {
      const memories: MemoryItem[] = []
      const messageText = Array.isArray(messages)
        ? messages.map((m) => (typeof m === 'string' ? m : m.content || JSON.stringify(m))).join(' ')
        : messages

      // Generate hash to check for duplicates
      const hash = this.generateHash(messageText)

      // Check if memory already exists
      const existing = await this.client.execute({
        sql: 'SELECT id FROM memories WHERE hash = ? AND is_deleted = 0',
        args: [hash]
      })

      if (existing.rows.length > 0) {
        // Memory already exists, return existing
        const existingMemory = await this.client.execute({
          sql: 'SELECT * FROM memories WHERE hash = ? AND is_deleted = 0',
          args: [hash]
        })

        if (existingMemory.rows.length > 0) {
          const row = existingMemory.rows[0]
          return {
            results: [
              {
                id: row.id as string,
                memory: row.memory as string,
                hash: row.hash as string,
                createdAt: row.created_at as string,
                updatedAt: row.updated_at as string,
                metadata: row.metadata ? JSON.parse(row.metadata as string) : {}
              }
            ]
          }
        }
      }

      // Create new memory
      const memoryId = uuid4()
      const metadata = JSON.stringify(options.metadata || {})

      // Generate embedding if model is configured
      let embeddingVector: string | null = null
      const embeddingModel = this.config?.embedderModel
      const provider = this.config?.embedderProvider
      if (embeddingModel) {
        try {
          const result = await this.embeddingService.generateEmbedding(messageText, {
            model: embeddingModel.id,
            provider: embeddingModel.provider,
            apiKey: provider?.apiKey || '',
            apiVersion: provider?.apiVersion,
            baseURL: provider?.apiHost || '',
            dimensions: EmbeddingService.getModelDimensions(embeddingModel.id)
          })
          embeddingVector = this.embeddingToVector32(result.embedding)
        } catch (error) {
          console.warn('Failed to generate embedding, storing without vector:', error)
        }
      }

      if (embeddingVector) {
        await this.client.execute({
          sql: `INSERT INTO memories
                (id, memory, hash, embedding, metadata, user_id, agent_id, run_id, created_at, updated_at)
                VALUES (?, ?, ?, vector32(?), ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          args: [memoryId, messageText, hash, embeddingVector, metadata]
        })
      } else {
        await this.client.execute({
          sql: `INSERT INTO memories
                (id, memory, hash, metadata, user_id, agent_id, run_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          args: [memoryId, messageText, hash, metadata]
        })
      }

      // Add to history
      await this.addHistory(memoryId, null, messageText, 'ADD')

      const newMemory: MemoryItem = {
        id: memoryId,
        memory: messageText,
        hash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: options.metadata || {}
      }

      memories.push(newMemory)

      return { results: memories }
    } catch (error) {
      console.error('Error adding memory:', error)
      throw error
    }
  }

  public async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      let sql = `
        SELECT id, memory, hash, metadata, user_id, agent_id, run_id, created_at, updated_at
        FROM memories
        WHERE is_deleted = 0
      `
      const args: any[] = []

      // Add text search
      if (query.trim()) {
        sql += ` AND memory LIKE ?`
        args.push(`%${query}%`)
      }

      // Add filters
      if (options.userId) {
        sql += ` AND user_id = ?`
        args.push(options.userId)
      }
      if (options.agentId) {
        sql += ` AND agent_id = ?`
        args.push(options.agentId)
      }
      if (options.runId) {
        sql += ` AND run_id = ?`
        args.push(options.runId)
      }

      // Add ordering and limit
      sql += ` ORDER BY created_at DESC`
      if (options.limit) {
        sql += ` LIMIT ?`
        args.push(options.limit)
      }

      const result = await this.client.execute({ sql, args })

      const memories: MemoryItem[] = result.rows.map((row) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: row.hash as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
        score: 1.0 // Default score for text search
      }))

      return { results: memories }
    } catch (error) {
      console.error('Error searching memories:', error)
      throw error
    }
  }

  public async list(options?: MemoryListOptions): Promise<MemorySearchResult> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      let sql = `
        SELECT id, memory, hash, metadata, user_id, agent_id, run_id, created_at, updated_at
        FROM memories
        WHERE is_deleted = 0
      `
      const args: any[] = []

      // Add filters
      if (options?.userId) {
        sql += ` AND user_id = ?`
        args.push(options.userId)
      }
      if (options?.agentId) {
        sql += ` AND agent_id = ?`
        args.push(options.agentId)
      }

      // Add ordering and limit
      sql += ` ORDER BY created_at DESC`
      if (options?.limit) {
        sql += ` LIMIT ?`
        args.push(options.limit)
      }

      const result = await this.client.execute({ sql, args })

      const memories: MemoryItem[] = result.rows.map((row) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: row.hash as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : {}
      }))

      return { results: memories }
    } catch (error) {
      console.error('Error listing memories:', error)
      throw error
    }
  }

  public async delete(id: string): Promise<void> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      // Get existing memory for history
      const existing = await this.client.execute({
        sql: 'SELECT memory FROM memories WHERE id = ? AND is_deleted = 0',
        args: [id]
      })

      if (existing.rows.length === 0) {
        throw new Error('Memory not found')
      }

      // Soft delete
      await this.client.execute({
        sql: 'UPDATE memories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        args: [id]
      })

      // Add to history
      await this.addHistory(id, existing.rows[0].memory as string, null, 'DELETE')
    } catch (error) {
      console.error('Error deleting memory:', error)
      throw error
    }
  }

  public async update(id: string, memory: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      // Get existing memory for history
      const existing = await this.client.execute({
        sql: 'SELECT memory FROM memories WHERE id = ? AND is_deleted = 0',
        args: [id]
      })

      if (existing.rows.length === 0) {
        throw new Error('Memory not found')
      }

      const previousMemory = existing.rows[0].memory as string
      const hash = this.generateHash(memory)
      const metadataJson = JSON.stringify(metadata || {})

      // Generate new embedding if model is configured
      let embeddingVector: string | null = null
      if (this.config?.embedderModel) {
        try {
          const embedding = await this.generateEmbedding(memory)
          embeddingVector = this.embeddingToVector32(embedding)
        } catch (error) {
          console.warn('Failed to generate embedding for update:', error)
        }
      }

      // Update memory with or without embedding
      if (embeddingVector) {
        await this.client.execute({
          sql: `UPDATE memories
                SET memory = ?, hash = ?, metadata = ?, embedding = vector32(?), updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [memory, hash, metadataJson, embeddingVector, id]
        })
      } else {
        await this.client.execute({
          sql: `UPDATE memories
                SET memory = ?, hash = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
          args: [memory, hash, metadataJson, id]
        })
      }

      // Add to history
      await this.addHistory(id, previousMemory, memory, 'UPDATE')
    } catch (error) {
      console.error('Error updating memory:', error)
      throw error
    }
  }

  public async get(memoryId: string): Promise<MemoryHistoryItem[]> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      const result = await this.client.execute({
        sql: `SELECT * FROM memory_history
              WHERE memory_id = ? AND is_deleted = 0
              ORDER BY created_at DESC`,
        args: [memoryId]
      })

      return result.rows.map((row) => ({
        id: row.id as number,
        memoryId: row.memory_id as string,
        previousValue: row.previous_value as string,
        newValue: row.new_value as string,
        action: row.action as 'ADD' | 'UPDATE' | 'DELETE',
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        isDeleted: Boolean(row.is_deleted)
      }))
    } catch (error) {
      console.error('Error getting memory history:', error)
      throw error
    }
  }

  private async addHistory(
    memoryId: string,
    previousValue: string | null,
    newValue: string | null,
    action: 'ADD' | 'UPDATE' | 'DELETE'
  ): Promise<void> {
    if (!this.client) return

    try {
      await this.client.execute({
        sql: `INSERT INTO memory_history
              (memory_id, previous_value, new_value, action, created_at, updated_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [memoryId, previousValue, newValue, action]
      })
    } catch (error) {
      console.error('Error adding memory history:', error)
    }
  }

  public async reset(): Promise<void> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      await this.client.execute('DELETE FROM memory_history')
      await this.client.execute('DELETE FROM memories')
      console.log('Memory database reset successfully')
    } catch (error) {
      console.error('Error resetting memory database:', error)
      throw error
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      this.client.close()
    }
  }

  /**
   * Generate embedding for text using configured model
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!this.config?.embedderModel) {
      throw new Error('No embedding model configured. Call updateConfig() first.')
    }

    try {
      const provider = this.config?.embedderProvider
      if (!provider) {
        throw new Error('No embedding provider configured. Call updateConfig() with a provider.')
      }
      const result = await this.embeddingService.generateEmbedding(text, {
        model: this.config.embedderModel.id,
        provider: this.config.embedderModel.provider,
        apiKey: provider.apiKey,
        apiVersion: provider.apiVersion,
        baseURL: provider.apiHost,
        dimensions: EmbeddingService.getModelDimensions(this.config.embedderModel.id)
      })
      return result.embedding
    } catch (error) {
      console.error('Error generating embedding:', error)
      throw error
    }
  }

  /**
   * Convert embedding array to libsql vector format
   */
  private embeddingToVector32(embedding: number[]): string {
    return `[${embedding.join(',')}]`
  }
}

export default MemoryService
