// Export types for use in other modules
export interface MemoryItem {
  id: string
  memory: string
  hash?: string
  createdAt?: string
  updatedAt?: string
  score?: number
  metadata?: Record<string, any>
}

export interface SearchResult {
  results: MemoryItem[]
  relations?: any[]
}

export interface Entity {
  userId?: string
  agentId?: string
  runId?: string
}

export interface SearchFilters extends Entity {
  [key: string]: any
}

export interface AddMemoryOptions extends Entity {
  metadata?: Record<string, any>
  filters?: SearchFilters
  infer?: boolean
}

export interface SearchMemoryOptions extends Entity {
  limit?: number
  filters?: SearchFilters
  threshold?: number
}

export interface GetAllMemoryOptions extends Entity {
  limit?: number
}

export interface MemoryHistoryItem {
  id: number
  memoryId: string
  previousValue?: string
  newValue: string
  action: 'ADD' | 'UPDATE' | 'DELETE'
  createdAt: string
  updatedAt: string
  isDeleted: boolean
}
