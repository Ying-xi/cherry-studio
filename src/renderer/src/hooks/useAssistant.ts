import { db } from '@renderer/databases'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  addAssistant,
  removeAssistant,
  setModel,
  updateAssistant,
  updateAssistants,
  updateAssistantSettings,
  updateDefaultAssistant
} from '@renderer/store/assistants'
import { setDefaultModel, setQuickAssistantModel, setTopicNamingModel, setTranslateModel } from '@renderer/store/llm'
import { selectTopicsForAssistant, topicsActions } from '@renderer/store/topics'
import { Assistant, AssistantSettings, Model, Topic } from '@renderer/types'
import { useCallback, useMemo } from 'react'

export function useAssistants() {
  const { assistants } = useAppSelector((state) => state.assistants)
  const dispatch = useAppDispatch()

  return {
    assistants,
    updateAssistants: (assistants: Assistant[]) => dispatch(updateAssistants(assistants)),
    addAssistant: (assistant: Assistant) => dispatch(addAssistant(assistant)),
    removeAssistant: (id: string) => {
      dispatch(removeAssistant({ id }))
      // Remove all topics for this assistant
      dispatch(topicsActions.removeAllTopics({ assistantId: id }))
    }
  }
}

export function useAssistant(id: string) {
  const assistant = useAppSelector((state) => state.assistants.assistants.find((a) => a.id === id) as Assistant)
  const topics = useTopicsForAssistant(id)
  const dispatch = useAppDispatch()
  const { defaultModel } = useDefaultModel()

  const model = useMemo(() => assistant?.model ?? assistant?.defaultModel ?? defaultModel, [assistant, defaultModel])
  if (!model) {
    throw new Error(`Assistant model is not set for assistant with name: ${assistant?.name ?? 'unknown'}`)
  }

  const assistantWithModel = useMemo(() => ({ ...assistant, model, topics }), [assistant, model, topics])

  return {
    assistant: assistantWithModel,
    model,
    topics,
    addTopic: (topic: Topic) => dispatch(topicsActions.addTopic({ assistantId: id, topic })),
    removeTopic: (topic: Topic) => {
      dispatch(topicsActions.removeTopic({ assistantId: id, topicId: topic.id }))
    },
    moveTopic: (topic: Topic, toAssistant: Assistant) => {
      dispatch(topicsActions.moveTopic({ fromAssistantId: id, toAssistantId: toAssistant.id, topicId: topic.id }))
      // update topic messages in database
      db.topics
        .where('id')
        .equals(topic.id)
        .modify((dbTopic) => {
          if (dbTopic.messages) {
            dbTopic.messages = dbTopic.messages.map((message) => ({
              ...message,
              assistantId: toAssistant.id
            }))
          }
        })
    },
    updateTopic: (topic: Topic) => dispatch(topicsActions.updateTopic({ assistantId: id, topic })),
    updateTopics: (topics: Topic[]) => dispatch(topicsActions.updateTopics({ assistantId: id, topics })),
    removeAllTopics: () => dispatch(topicsActions.removeAllTopics({ assistantId: id })),
    setModel: useCallback(
      (model: Model) => assistant && dispatch(setModel({ assistantId: assistant?.id, model })),
      [assistant, dispatch]
    ),
    updateAssistant: (assistant: Assistant) => dispatch(updateAssistant(assistant)),
    updateAssistantSettings: (settings: Partial<AssistantSettings>) => {
      dispatch(updateAssistantSettings({ assistantId: assistant.id, settings }))
    }
  }
}

export function useTopicsForAssistant(assistantId: string) {
  return useAppSelector((state) => selectTopicsForAssistant(state, assistantId))
}

export function useDefaultAssistant() {
  const defaultAssistant = useAppSelector((state) => state.assistants.defaultAssistant)
  const topics = useTopicsForAssistant(defaultAssistant.id)
  const dispatch = useAppDispatch()

  // Ensure default assistant has at least one topic
  const finalTopics = useMemo(() => {
    if (topics.length > 0) {
      return topics
    }
    return [getDefaultTopic(defaultAssistant.id)]
  }, [topics, defaultAssistant.id])

  return {
    defaultAssistant: {
      ...defaultAssistant,
      topics: finalTopics
    },
    updateDefaultAssistant: (assistant: Assistant) => dispatch(updateDefaultAssistant({ assistant }))
  }
}

export function useDefaultModel() {
  const { defaultModel, topicNamingModel, translateModel, quickAssistantModel } = useAppSelector((state) => state.llm)
  const dispatch = useAppDispatch()

  return {
    defaultModel,
    topicNamingModel,
    translateModel,
    quickAssistantModel,
    setDefaultModel: (model: Model) => dispatch(setDefaultModel({ model })),
    setTopicNamingModel: (model: Model) => dispatch(setTopicNamingModel({ model })),
    setTranslateModel: (model: Model) => dispatch(setTranslateModel({ model })),
    setQuickAssistantModel: (model: Model) => dispatch(setQuickAssistantModel({ model }))
  }
}
