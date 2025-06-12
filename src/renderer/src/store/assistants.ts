import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { DEFAULT_CONTEXTCOUNT, DEFAULT_TEMPERATURE } from '@renderer/config/constant'
import { getDefaultAssistant } from '@renderer/services/AssistantService'
import { Assistant, AssistantSettings, Model } from '@renderer/types'

export interface AssistantsState {
  defaultAssistant: Assistant
  assistants: Assistant[]
  tagsOrder: string[]
}

// 之前的两个实例会导致两个助手不一致的问题
// FIXME: 更彻底的办法在这次重构就直接把二者合并了
// Create a single default assistant instance to ensure consistency
const defaultAssistant = getDefaultAssistant()

const initialState: AssistantsState = {
  defaultAssistant: defaultAssistant,
  assistants: [defaultAssistant], // Share the same reference
  tagsOrder: []
}

const assistantsSlice = createSlice({
  name: 'assistants',
  initialState,
  reducers: {
    updateDefaultAssistant: (state, action: PayloadAction<{ assistant: Assistant }>) => {
      const assistant = action.payload.assistant
      state.defaultAssistant = assistant

      // Also update the corresponding assistant in the array
      const index = state.assistants.findIndex((a) => a.id === assistant.id)
      if (index !== -1) {
        state.assistants[index] = assistant
      }
    },
    updateAssistants: (state, action: PayloadAction<Assistant[]>) => {
      state.assistants = action.payload

      // Update defaultAssistant if it exists in the new array
      const defaultInArray = action.payload.find((a) => a.id === state.defaultAssistant.id)
      if (defaultInArray) {
        state.defaultAssistant = defaultInArray
      }
    },
    addAssistant: (state, action: PayloadAction<Assistant>) => {
      state.assistants.push(action.payload)
    },
    removeAssistant: (state, action: PayloadAction<{ id: string }>) => {
      state.assistants = state.assistants.filter((c) => c.id !== action.payload.id)
    },
    updateAssistant: (state, action: PayloadAction<Assistant>) => {
      const assistant = action.payload
      state.assistants = state.assistants.map((c) => (c.id === assistant.id ? assistant : c))

      // Also update defaultAssistant if it's the same assistant
      if (state.defaultAssistant.id === assistant.id) {
        state.defaultAssistant = assistant
      }
    },
    updateAssistantSettings: (
      state,
      action: PayloadAction<{ assistantId: string; settings: Partial<AssistantSettings> }>
    ) => {
      for (const assistant of state.assistants) {
        const settings = action.payload.settings
        if (assistant.id === action.payload.assistantId) {
          for (const key in settings) {
            if (!assistant.settings) {
              assistant.settings = {
                temperature: DEFAULT_TEMPERATURE,
                contextCount: DEFAULT_CONTEXTCOUNT,
                enableMaxTokens: false,
                maxTokens: 0,
                streamOutput: true
              }
            }
            assistant.settings[key] = settings[key]
          }
        }
      }
    },

    setModel: (state, action: PayloadAction<{ assistantId: string; model: Model }>) => {
      const { assistantId, model } = action.payload
      state.assistants = state.assistants.map((assistant) =>
        assistant.id === assistantId
          ? {
              ...assistant,
              model: model
            }
          : assistant
      )

      // Also update defaultAssistant if it's the same assistant
      if (state.defaultAssistant.id === assistantId) {
        state.defaultAssistant = {
          ...state.defaultAssistant,
          model: model
        }
      }
    },
    setTagsOrder: (state, action: PayloadAction<string[]>) => {
      state.tagsOrder = action.payload
    }
  }
})

export const {
  updateDefaultAssistant,
  updateAssistants,
  addAssistant,
  removeAssistant,
  updateAssistant,
  setModel,
  setTagsOrder,
  updateAssistantSettings
} = assistantsSlice.actions

export default assistantsSlice.reducer
