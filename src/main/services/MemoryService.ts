import { Client, createClient } from '@libsql/client'
import crypto from 'crypto'
import { app } from 'electron'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

// Import types from renderer
interface MemoryItem {
  id: string
  memory: string
  hash?: string
  createdAt?: string
  updatedAt?: string
  score?: number
  metadata?: Record<string, any>
}

interface SearchResult {
  results: MemoryItem[]
  relations?: any[]
}

interface Entity {
  userId?: string
  agentId?: string
  runId?: string
}

interface SearchFilters extends Entity {
  [key: string]: any
}

interface AddMemoryOptions extends Entity {
  metadata?: Record<string, any>
  filters?: SearchFilters
  infer?: boolean
}

interface SearchMemoryOptions extends Entity {
  limit?: number
  filters?: SearchFilters
  threshold?: number
}

interface GetAllMemoryOptions extends Entity {
  limit?: number
}

interface MemoryHistoryItem {
  id: number
  memoryId: string
  previousValue?: string
  newValue: string
  action: 'ADD' | 'UPDATE' | 'DELETE'
  createdAt: string
  updatedAt: string
  isDeleted: boolean
}

class MemoryService {
  private static instance: MemoryService | null = null
  private client: Client | null = null
  private isInitialized = false

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Create database file in userData directory
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'memory.db')

      this.client = createClient({
        url: `file:${dbPath}`
      })

      // Create tables
      await this.createTables()
      this.isInitialized = true

      console.log('MemoryService initialized successfully')
    } catch (error) {
      console.error('Failed to initialize MemoryService:', error)
      throw error
    }
  }

  private async createTables(): Promise<void> {
    if (!this.client) throw new Error('Database client not initialized')

    // Create memories table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        memory TEXT NOT NULL,
        hash TEXT UNIQUE,
        embedding BLOB,
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

    // Create indexes
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(hash)`)
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_memory_history_memory_id ON memory_history(memory_id)`)
  }

  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
  }

  // Vector utility methods for future implementation (Phase 2)
  /*
  private serializeEmbedding(embedding: number[]): Buffer {
    // Convert float array to binary buffer
    const buffer = Buffer.allocUnsafe(embedding.length * 4)
    embedding.forEach((value, index) => {
      buffer.writeFloatLE(value, index * 4)
    })
    return buffer
  }

  private deserializeEmbedding(buffer: Buffer): number[] {
    // Convert binary buffer back to float array
    const embedding: number[] = []
    for (let i = 0; i < buffer.length; i += 4) {
      embedding.push(buffer.readFloatLE(i))
    }
    return embedding
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
  */

  public async add(messages: string | any[], config: AddMemoryOptions): Promise<SearchResult> {
    if (!this.client) throw new Error('Database client not initialized')

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
      const memoryId = uuidv4()
      const metadata = JSON.stringify(config.metadata || {})

      await this.client.execute({
        sql: `INSERT INTO memories 
              (id, memory, hash, metadata, user_id, agent_id, run_id, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        args: [
          memoryId,
          messageText,
          hash,
          metadata,
          config.userId || null,
          config.agentId || null,
          config.runId || null
        ]
      })

      // Add to history
      await this.addHistory(memoryId, null, messageText, 'ADD')

      const newMemory: MemoryItem = {
        id: memoryId,
        memory: messageText,
        hash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: config.metadata || {}
      }

      memories.push(newMemory)

      return { results: memories }
    } catch (error) {
      console.error('Error adding memory:', error)
      throw error
    }
  }

  public async search(query: string, config: SearchMemoryOptions): Promise<SearchResult> {
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
      if (config.userId) {
        sql += ` AND user_id = ?`
        args.push(config.userId)
      }
      if (config.agentId) {
        sql += ` AND agent_id = ?`
        args.push(config.agentId)
      }
      if (config.runId) {
        sql += ` AND run_id = ?`
        args.push(config.runId)
      }

      // Add ordering and limit
      sql += ` ORDER BY created_at DESC`
      if (config.limit) {
        sql += ` LIMIT ?`
        args.push(config.limit)
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

  public async list(config?: GetAllMemoryOptions): Promise<SearchResult> {
    if (!this.client) throw new Error('Database client not initialized')

    try {
      let sql = `
        SELECT id, memory, hash, metadata, user_id, agent_id, run_id, created_at, updated_at 
        FROM memories 
        WHERE is_deleted = 0
      `
      const args: any[] = []

      // Add filters
      if (config?.userId) {
        sql += ` AND user_id = ?`
        args.push(config.userId)
      }
      if (config?.agentId) {
        sql += ` AND agent_id = ?`
        args.push(config.agentId)
      }

      // Add ordering and limit
      sql += ` ORDER BY created_at DESC`
      if (config?.limit) {
        sql += ` LIMIT ?`
        args.push(config.limit)
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

      // Update memory
      await this.client.execute({
        sql: `UPDATE memories 
              SET memory = ?, hash = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?`,
        args: [memory, hash, metadataJson, id]
      })

      // Add to history
      await this.addHistory(id, previousMemory, memory, 'UPDATE')
    } catch (error) {
      console.error('Error updating memory:', error)
      throw error
    }
  }

  public async getHistory(memoryId: string): Promise<MemoryHistoryItem[]> {
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
      this.client = null
      this.isInitialized = false
    }
  }

  // Placeholder for future embedding functionality
  public async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement embedding generation using configured model
    // This will be implemented in Phase 2
    console.log('Embedding generation not yet implemented for:', text)
    return []
  }
}

export default MemoryService
