import { InfoCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { Box } from '@renderer/components/Layout'
import MemoryService from '@renderer/services/MemoryService'
import { selectMemoryConfig } from '@renderer/store/memory'
import { Assistant, AssistantSettings } from '@renderer/types'
import { Alert, Button, Card, Form, Space, Switch, Tooltip, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import MemoriesSettingsModal from '../../memory/settings-modal'

const { Text, Paragraph } = Typography

interface Props {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
  updateAssistantSettings: (settings: AssistantSettings) => void
}

const AssistantMemorySettings: React.FC<Props> = ({ assistant, updateAssistant }) => {
  const { t } = useTranslation()
  const memoryConfig = useSelector(selectMemoryConfig)
  const [memoryStats, setMemoryStats] = useState<{ count: number; loading: boolean }>({
    count: 0,
    loading: true
  })
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [form] = Form.useForm()
  const memoryService = MemoryService.getInstance()

  // Load memory statistics for this assistant
  const loadMemoryStats = useCallback(async () => {
    setMemoryStats((prev) => ({ ...prev, loading: true }))
    try {
      const result = await memoryService.list({
        agentId: assistant.id,
        limit: 1000
      })
      setMemoryStats({ count: result.results.length, loading: false })
    } catch (error) {
      console.error('Failed to load memory stats:', error)
      setMemoryStats({ count: 0, loading: false })
    }
  }, [assistant.id, memoryService])

  useEffect(() => {
    loadMemoryStats()
  }, [loadMemoryStats])

  const handleMemoryToggle = (enabled: boolean) => {
    updateAssistant({ ...assistant, enableMemory: enabled })
  }

  const isMemoryConfigured = memoryConfig.embedderModel && memoryConfig.llmModel

  return (
    <Container>
      <HeaderContainer>
        <Box style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {t('memory.title', 'Memory')}
          <Tooltip
            title={t(
              'memory.description',
              'Enable memory to help the assistant remember facts and context from conversations'
            )}>
            <InfoIcon />
          </Tooltip>
        </Box>
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setSettingsModalVisible(true)}>
            {t('common.settings')}
          </Button>
          <Switch
            checked={assistant.enableMemory || false}
            onChange={handleMemoryToggle}
            disabled={!isMemoryConfigured}
          />
        </Space>
      </HeaderContainer>

      {!isMemoryConfigured && (
        <Alert
          type="warning"
          message={t('memory.not_configured_title', 'Memory Not Configured')}
          description={t(
            'memory.not_configured_desc',
            'Please configure embedding and LLM models in memory settings to enable memory functionality.'
          )}
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => setSettingsModalVisible(true)}>
              {t('common.configure')}
            </Button>
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>{t('memory.status', 'Status')}: </Text>
            <Text type={assistant.enableMemory ? 'success' : 'secondary'}>
              {assistant.enableMemory ? t('common.enabled') : t('common.disabled')}
            </Text>
          </div>
          <div>
            <Text strong>{t('memory.stored_memories', 'Stored Memories')}: </Text>
            <Text>{memoryStats.loading ? t('common.loading') : memoryStats.count}</Text>
          </div>
          {memoryConfig.embedderModel && (
            <div>
              <Text strong>{t('memory.embedding_model', 'Embedding Model')}: </Text>
              <Text code>{memoryConfig.embedderModel.name}</Text>
            </div>
          )}
          {memoryConfig.llmModel && (
            <div>
              <Text strong>{t('memory.llm_model', 'LLM Model')}: </Text>
              <Text code>{memoryConfig.llmModel.name}</Text>
            </div>
          )}
        </Space>
      </Card>

      <InfoCard>
        <Paragraph type="secondary" style={{ margin: 0, fontSize: '13px' }}>
          {t('memory.assistant_info', 'When memory is enabled, this assistant will:')}
        </Paragraph>
        <ul style={{ margin: '8px 0 0 16px', fontSize: '13px', color: 'var(--color-text-2)' }}>
          <li>{t('memory.feature_1', 'Remember facts and preferences from conversations')}</li>
          <li>{t('memory.feature_2', 'Provide more personalized responses based on context')}</li>
          <li>{t('memory.feature_3', 'Automatically extract and store relevant information')}</li>
          <li>{t('memory.feature_4', 'Search memories to enhance conversation relevance')}</li>
        </ul>
      </InfoCard>

      <MemoriesSettingsModal
        visible={settingsModalVisible}
        onSubmit={() => setSettingsModalVisible(false)}
        onCancel={() => setSettingsModalVisible(false)}
        form={form}
      />
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`

const InfoIcon = styled(InfoCircleOutlined)`
  margin-left: 6px;
  font-size: 14px;
  color: var(--color-text-2);
  cursor: help;
`

const InfoCard = styled.div`
  padding: 12px;
  background-color: var(--color-background-soft);
  border-radius: 8px;
  border: 1px solid var(--color-border);
`

export default AssistantMemorySettings
