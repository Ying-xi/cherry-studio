import AiProvider from '@renderer/aiCore'
import { AssistantMessage } from '@renderer/types'
import { MemoryConfig, MemoryItem } from '@renderer/types/memory'
import {
  FactRetrievalSchema,
  getFactRetrievalMessages,
  getUpdateMemoryMessages,
  MemoryUpdateSchema
} from '@renderer/utils/memory-prompts'
import { ChatCompletionMessageParam } from 'openai/resources'

import { getProviderByModel } from './AssistantService'
import MemoryService from './MemoryService'

export interface MemoryProcessorConfig {
  memoryConfig: MemoryConfig
  assistantId?: string
  userId?: string
}

export class MemoryProcessor {
  private memoryService: MemoryService

  constructor() {
    this.memoryService = MemoryService.getInstance()
  }

  /**
   * Extract facts from conversation messages
   * @param messages - Array of conversation messages
   * @param config - Memory processor configuration
   * @returns Array of extracted facts
   */
  async extractFacts(messages: AssistantMessage[], config: MemoryProcessorConfig): Promise<string[]> {
    try {
      const { memoryConfig } = config

      if (!memoryConfig.llmModel) {
        throw new Error('No LLM model configured for memory processing')
      }

      // Convert messages to string format for processing
      const parsedMessages = messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')

      // Get fact extraction prompt
      const [systemPrompt, userPrompt] = getFactRetrievalMessages(
        parsedMessages,
        memoryConfig.customFactExtractionPrompt
      )

      // Create messages for LLM
      const llmMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]

      // Call LLM for fact extraction
      const provider = getProviderByModel(memoryConfig.llmModel)
      const AI = new AiProvider(provider)

      let responseContent = ''
      await AI.completions({
        callType: 'chat',
        messages: llmMessages as any,
        assistant: {
          model: memoryConfig.llmModel,
          settings: {
            temperature: 0.1
          }
        } as any,
        maxTokens: 1000,
        onChunk: (chunk: any) => {
          if (chunk.type === 'text' && chunk.text) {
            responseContent += chunk.text
          }
        }
      } as any)

      if (!responseContent.trim()) {
        return []
      }

      // Parse response using Zod schema
      try {
        const parsed = FactRetrievalSchema.parse(JSON.parse(responseContent))
        return parsed.facts
      } catch (parseError) {
        console.error('Failed to parse fact extraction response:', parseError)
        // Try to extract facts manually from response
        const content = responseContent.trim()
        if (content.startsWith('{') && content.endsWith('}')) {
          try {
            const json = JSON.parse(content)
            return Array.isArray(json.facts) ? json.facts : []
          } catch {
            return []
          }
        }
        return []
      }
    } catch (error) {
      console.error('Error extracting facts:', error)
      return []
    }
  }

  /**
   * Update memories with new facts
   * @param facts - Array of new facts to process
   * @param config - Memory processor configuration
   * @returns Array of memory operations performed
   */
  async updateMemories(
    facts: string[],
    config: MemoryProcessorConfig
  ): Promise<Array<{ action: string; [key: string]: any }>> {
    try {
      if (facts.length === 0) {
        return []
      }

      const { memoryConfig, assistantId, userId } = config

      if (!memoryConfig.llmModel) {
        throw new Error('No LLM model configured for memory processing')
      }

      // Get existing memories for the user/assistant
      const existingMemoriesResult = await this.memoryService.list({
        userId,
        agentId: assistantId,
        limit: 100
      })

      const existingMemories = existingMemoriesResult.results.map((memory) => ({
        id: memory.id,
        text: memory.memory
      }))

      // Generate update memory prompt
      const updatePrompt = getUpdateMemoryMessages(existingMemories, facts, memoryConfig.customUpdateMemoryPrompt)

      // Create messages for LLM
      const llmMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: updatePrompt },
        { role: 'user', content: 'Please process the new facts and update the memory accordingly.' }
      ]

      // Call LLM for memory update logic
      const provider = getProviderByModel(memoryConfig.llmModel)
      const AI = new AiProvider(provider)

      let responseContent = ''
      await AI.completions({
        callType: 'chat',
        messages: llmMessages as any,
        assistant: {
          model: memoryConfig.llmModel,
          settings: {
            temperature: 0.1
          }
        } as any,
        maxTokens: 2000,
        onChunk: (chunk: any) => {
          if (chunk.type === 'text' && chunk.text) {
            responseContent += chunk.text
          }
        }
      } as any)

      if (!responseContent.trim()) {
        return []
      }

      // Parse response using Zod schema
      try {
        const parsed = MemoryUpdateSchema.parse(JSON.parse(responseContent))
        const operations: Array<{ action: string; [key: string]: any }> = []

        for (const memoryOp of parsed.memory) {
          switch (memoryOp.event) {
            case 'ADD':
              try {
                const result = await this.memoryService.add(memoryOp.text, {
                  userId,
                  agentId: assistantId,
                  metadata: { userId, assistantId }
                })
                operations.push({ action: 'ADD', memory: memoryOp.text, result })
              } catch (error) {
                console.error('Failed to add memory:', error)
              }
              break

            case 'UPDATE':
              try {
                // Find the memory to update
                const existingMemory = existingMemoriesResult.results.find((m) => m.id === memoryOp.id)
                if (existingMemory) {
                  await this.memoryService.update(memoryOp.id, memoryOp.text, {
                    userId,
                    assistantId,
                    oldMemory: memoryOp.old_memory
                  })
                  operations.push({
                    action: 'UPDATE',
                    id: memoryOp.id,
                    oldMemory: memoryOp.old_memory,
                    newMemory: memoryOp.text
                  })
                }
              } catch (error) {
                console.error('Failed to update memory:', error)
              }
              break

            case 'DELETE':
              try {
                await this.memoryService.delete(memoryOp.id)
                operations.push({ action: 'DELETE', id: memoryOp.id, memory: memoryOp.text })
              } catch (error) {
                console.error('Failed to delete memory:', error)
              }
              break

            case 'NONE':
              // No action needed
              break
          }
        }

        return operations
      } catch (parseError) {
        console.error('Failed to parse memory update response:', parseError)
        return []
      }
    } catch (error) {
      console.error('Error updating memories:', error)
      return []
    }
  }

  /**
   * Process conversation and update memories
   * @param messages - Array of conversation messages
   * @param config - Memory processor configuration
   * @returns Processing results
   */
  async processConversation(messages: AssistantMessage[], config: MemoryProcessorConfig) {
    try {
      // Extract facts from conversation
      const facts = await this.extractFacts(messages, config)

      if (facts.length === 0) {
        return { facts: [], operations: [] }
      }

      // Update memories with extracted facts
      const operations = await this.updateMemories(facts, config)

      return { facts, operations }
    } catch (error) {
      console.error('Error processing conversation:', error)
      return { facts: [], operations: [] }
    }
  }

  /**
   * Search memories for relevant context
   * @param query - Search query
   * @param config - Memory processor configuration
   * @param limit - Maximum number of results
   * @returns Array of relevant memories
   */
  async searchRelevantMemories(query: string, config: MemoryProcessorConfig, limit: number = 5): Promise<MemoryItem[]> {
    try {
      const { assistantId, userId } = config

      const result = await this.memoryService.search(query, {
        userId,
        agentId: assistantId,
        limit
      })

      return result.results
    } catch (error) {
      console.error('Error searching memories:', error)
      return []
    }
  }

  /**
   * Get memory processing configuration from store
   * @param assistantId - Optional assistant ID
   * @param userId - Optional user ID
   * @returns Memory processor configuration
   */
  static getProcessorConfig(memoryConfig: MemoryConfig, assistantId?: string, userId?: string): MemoryProcessorConfig {
    return {
      memoryConfig,
      assistantId,
      userId
    }
  }
}

export const memoryProcessor = new MemoryProcessor()
