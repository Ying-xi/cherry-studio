import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { factExtractionPrompt, updateMemoryPrompt } from '@renderer/utils/memory-prompts'
import type { MemoryConfig } from '@types'

/**
 * Memory store state interface
 * Manages a single memory configuration for the application
 */
export interface MemoryState {
  /** The current memory configuration */
  memoryConfig: MemoryConfig
  /** The currently selected user ID for memory operations */
  currentUserId: string
}

// Default memory configuration to avoid undefined errors
const defaultMemoryConfig: MemoryConfig = {
  embedderDimensions: 1536,
  customFactExtractionPrompt: factExtractionPrompt,
  customUpdateMemoryPrompt: updateMemoryPrompt
}

/**
 * Initial state for the memory store
 */
export const initialState: MemoryState = {
  memoryConfig: defaultMemoryConfig,
  currentUserId: localStorage.getItem('memory_currentUserId') || 'default-user'
}

/**
 * Redux slice for managing memory configuration
 *
 * Usage example:
 * ```typescript
 * // Setting a memory config
 * dispatch(updateMemoryConfig(newConfig))
 *
 * // Getting the memory config
 * const config = useSelector(getMemoryConfig)
 * ```
 */
const memorySlice = createSlice({
  name: 'memory',
  initialState,
  reducers: {
    /**
     * Updates the memory configuration
     * @param state - Current memory state
     * @param action - Payload containing the new MemoryConfig
     */
    updateMemoryConfig: (state, action: PayloadAction<MemoryConfig>) => {
      state.memoryConfig = action.payload
    },
    /**
     * Sets the current user ID and persists it to localStorage
     * @param state - Current memory state
     * @param action - Payload containing the new user ID
     */
    setCurrentUserId: (state, action: PayloadAction<string>) => {
      state.currentUserId = action.payload
      localStorage.setItem('memory_currentUserId', action.payload)
    }
  },
  selectors: {
    /**
     * Selector to get the current memory configuration
     * @param state - Memory state
     * @returns The current MemoryConfig or undefined if not set
     */
    getMemoryConfig: (state) => state.memoryConfig,
    /**
     * Selector to get the current user ID
     * @param state - Memory state
     * @returns The current user ID
     */
    getCurrentUserId: (state) => state.currentUserId
  }
})

// Export action creators
export const { updateMemoryConfig, setCurrentUserId } = memorySlice.actions

// Export selectors
export const { getMemoryConfig, getCurrentUserId } = memorySlice.selectors

// Type-safe selector for accessing this slice from the root state
export const selectMemory = (state: { memory: MemoryState }) => state.memory

// Root state selector for memory config with safety check
export const selectMemoryConfig = (state: { memory?: MemoryState }) => state.memory?.memoryConfig || defaultMemoryConfig

// Root state selector for current user ID with safety check
export const selectCurrentUserId = (state: { memory?: MemoryState }) => state.memory?.currentUserId || 'default-user'

export { memorySlice }
// Export the reducer as default export
export default memorySlice.reducer
