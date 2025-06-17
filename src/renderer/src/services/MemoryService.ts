import store from '@renderer/store'
import { selectMemoryConfig } from '@renderer/store/memory'
import {
  AddMemoryOptions,
  AssistantMessage,
  MemoryHistoryItem,
  MemoryListOptions,
  MemorySearchOptions,
  MemorySearchResult
} from '@types'

import { getProviderByModel } from './AssistantService'

/**
 * Service for managing memory operations including storing, searching, and retrieving memories
 * This service delegates all operations to the main process via IPC
 */
class MemoryService {
  private static instance: MemoryService | null = null

  constructor() {
    this.init()
  }

  /**
   * Initializes the memory service by updating configuration in main process
   */
  private async init(): Promise<void> {
    await this.updateConfig()
  }

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService()
    }
    return MemoryService.instance
  }

  public static reloadInstance(): void {
    MemoryService.instance = new MemoryService()
  }

  /**
   * Lists all stored memories
   * @param config - Optional configuration for filtering memories
   * @returns Promise resolving to search results containing all memories
   */
  public async list(config?: MemoryListOptions): Promise<MemorySearchResult> {
    return window.api.memory.list(config)
  }

  /**
   * Adds new memory entries from messages
   * @param messages - String content or array of assistant messages to store as memory
   * @param config - Configuration options for adding memory
   * @returns Promise resolving to search results of added memories
   */
  public async add(messages: string | AssistantMessage[], options: AddMemoryOptions): Promise<MemorySearchResult> {
    return window.api.memory.add(messages, options)
  }

  /**
   * Searches stored memories based on query
   * @param query - Search query string to find relevant memories
   * @param config - Configuration options for memory search
   * @returns Promise resolving to search results matching the query
   */
  public async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult> {
    return window.api.memory.search(query, options)
  }

  /**
   * Deletes a specific memory by ID
   * @param id - Unique identifier of the memory to delete
   * @returns Promise that resolves when deletion is complete
   */
  public async delete(id: string): Promise<void> {
    return window.api.memory.delete(id)
  }

  /**
   * Updates a specific memory by ID
   * @param id - Unique identifier of the memory to update
   * @param memory - New memory content
   * @param metadata - Optional metadata to update
   * @returns Promise that resolves when update is complete
   */
  public async update(id: string, memory: string, metadata?: Record<string, any>): Promise<void> {
    return window.api.memory.update(id, memory, metadata)
  }

  /**
   * Gets the history of changes for a specific memory
   * @param id - Unique identifier of the memory
   * @returns Promise resolving to array of history items
   */
  public async get(id: string): Promise<MemoryHistoryItem[]> {
    return window.api.memory.get(id)
  }

  /**
   * Resets all memories (deletes everything)
   * @returns Promise that resolves when reset is complete
   */
  public async reset(): Promise<void> {
    return window.api.memory.reset()
  }

  /**
   * Updates the memory service configuration in the main process
   * Automatically gets current memory config and provider information from Redux store
   * @returns Promise that resolves when configuration is updated
   */
  public async updateConfig(): Promise<void> {
    const memoryConfig = selectMemoryConfig(store.getState())
    const embedderProvider = memoryConfig.embedderModel ? getProviderByModel(memoryConfig.embedderModel) : undefined
    const llmProvider = memoryConfig.llmModel ? getProviderByModel(memoryConfig.llmModel) : undefined

    const configWithProviders = {
      ...memoryConfig,
      embedderProvider,
      llmProvider
    }

    return window.api.memory.updateConfig(configWithProviders)
  }
}

export default MemoryService
