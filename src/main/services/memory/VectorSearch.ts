import { Client } from '@libsql/client'

// Import types from main memory types since we're in main process
interface MemoryItem {
  id: string
  memory: string
  hash?: string
  createdAt?: string
  updatedAt?: string
  score?: number
  metadata?: Record<string, any>
}

export interface VectorSearchOptions {
  limit?: number
  threshold?: number // Minimum similarity score (0-1, where 1 is identical)
  userId?: string
  agentId?: string
  filters?: Record<string, any>
}

export interface SearchResult {
  items: MemoryItem[]
  totalCount: number
}

export class VectorSearch {
  constructor(private db: Client) {}

  /**
   * Convert embedding array to libsql vector32 format
   */
  private embeddingToVector32(embedding: number[]): string {
    return `[${embedding.join(',')}]`
  }

  /**
   * Search memories by embedding similarity using libsql native vector functions
   */
  public async searchByVector(queryEmbedding: number[], options: VectorSearchOptions = {}): Promise<SearchResult> {
    const { limit = 10, threshold = 0.0, userId, agentId } = options

    try {
      // Convert query embedding to libsql vector format
      const queryVector = this.embeddingToVector32(queryEmbedding)

      // Build WHERE clause for filtering
      const whereConditions: string[] = ['m.is_deleted = 0', 'm.embedding IS NOT NULL']
      const params: any[] = [queryVector]

      if (userId) {
        whereConditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        whereConditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      // Fallback to direct query without vector_top_k if index doesn't exist
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
        ${whereClause}
        AND (1 - vector_distance_cos(m.embedding, vector32(?))) >= ?
        ORDER BY similarity DESC
        LIMIT ?
      `

      params.push(queryVector, queryVector, threshold, limit)

      const result = await this.db.execute({
        sql: query,
        args: params
      })

      const items: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        score: row.similarity as number
      }))

      return {
        items,
        totalCount: items.length
      }
    } catch (error) {
      console.error('Vector search failed:', error)
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Hybrid search combining text search and vector similarity
   */
  public async hybridSearch(
    query: string,
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<SearchResult> {
    const { limit = 10, threshold = 0.0, userId, agentId } = options

    try {
      const queryVector = this.embeddingToVector32(queryEmbedding)

      // Build WHERE clause for filtering
      const whereConditions: string[] = ['m.is_deleted = 0']
      const params: any[] = []

      // Add text search parameters first
      const exactMatch = `%${query}%`
      const fuzzyMatch = `%${query.split(' ').join('%')}%`

      params.push(queryVector, queryVector, exactMatch, fuzzyMatch, queryVector, exactMatch, fuzzyMatch)

      if (userId) {
        whereConditions.push('m.user_id = ?')
        params.push(userId)
      }

      if (agentId) {
        whereConditions.push('m.agent_id = ?')
        params.push(agentId)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      // Combine text search (LIKE) with vector similarity
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
        ${whereClause}
        HAVING combined_score >= ?
        ORDER BY combined_score DESC
        LIMIT ?
      `

      params.push(threshold, limit)

      const result = await this.db.execute({
        sql: hybridQuery,
        args: params
      })

      const items: MemoryItem[] = result.rows.map((row: any) => ({
        id: row.id as string,
        memory: row.memory as string,
        hash: (row.hash as string) || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        score: row.combined_score as number
      }))

      return {
        items,
        totalCount: items.length
      }
    } catch (error) {
      console.error('Hybrid search failed:', error)
      throw new Error(`Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get similar memories for deduplication
   */
  public async findSimilarMemories(
    embedding: number[],
    threshold: number = 0.9,
    excludeId?: string
  ): Promise<MemoryItem[]> {
    try {
      const queryVector = this.embeddingToVector32(embedding)

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
      console.error('Similar memories search failed:', error)
      throw new Error(`Similar memories search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Batch vector search for multiple queries
   */
  public async batchVectorSearch(
    queries: Array<{ embedding: number[]; options?: VectorSearchOptions }>,
    globalOptions: VectorSearchOptions = {}
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = []

    for (const query of queries) {
      const mergedOptions = { ...globalOptions, ...query.options }
      const result = await this.searchByVector(query.embedding, mergedOptions)
      results.push(result)
    }

    return results
  }
}
