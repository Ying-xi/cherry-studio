import {
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  UserAddOutlined,
  UserOutlined
} from '@ant-design/icons'
import MemoryService from '@renderer/services/MemoryService'
import { selectCurrentUserId, setCurrentUserId } from '@renderer/store/memory'
import { MemoryItem } from '@types'
import {
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Form,
  Input,
  Layout,
  MenuProps,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch, useSelector } from 'react-redux'
import styled from 'styled-components'

import MemoriesSettingsModal from './settings-modal'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text, Paragraph } = Typography
const { RangePicker } = DatePicker
const { Option } = Select
const { TextArea } = Input

// Styled Components
const StyledContent = styled(Content)`
  padding: 24px;
  background: var(--color-background);
  min-height: 100vh;
`

const HeaderCard = styled(Card)`
  background: #ffffff;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  .ant-card-body {
    padding: 24px;
  }

  .header-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .header-left {
    flex: 1;
  }

  .header-title {
    color: #1f2937;
    margin: 0 0 8px 0;
    font-weight: 600;
    font-size: 28px;
  }

  .header-description {
    color: #6b7280;
    margin: 0 0 12px 0;
    font-size: 16px;
  }

  .header-stats {
    color: #9ca3af;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .user-section {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .user-avatar {
    background: #3b82f6;
    color: white;
  }

  .user-details h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .user-details p {
    margin: 0;
    font-size: 12px;
    color: #6b7280;
  }

  .user-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
`

const FilterCard = styled(Card)`
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .ant-card-body {
    padding: 20px;
  }
`

const MemoryCard = styled(Card)`
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  margin-bottom: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    border-color: var(--color-primary);
    transform: translateY(-2px);
  }

  .ant-card-body {
    padding: 20px;
  }

  .memory-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .memory-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .memory-content {
    color: var(--color-text);
    font-size: 15px;
    line-height: 1.6;
    margin: 12px 0;
  }

  .memory-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
  }

  .score-badge {
    background: var(--color-background-mute);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
    font-family: var(--code-font-family);
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 6px;
  }
`

const EmptyStateContainer = styled.div`
  text-align: center;
  padding: 60px 20px;

  .empty-icon {
    font-size: 64px;
    color: var(--color-text-quaternary);
    margin-bottom: 16px;
  }

  .empty-title {
    color: var(--color-text);
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 8px;
  }

  .empty-description {
    color: var(--color-text-secondary);
    font-size: 14px;
    margin-bottom: 24px;
  }
`

const LoadingContainer = styled.div`
  text-align: center;
  padding: 60px 20px;
`

interface AddMemoryModalProps {
  visible: boolean
  onCancel: () => void
  onAdd: (memory: string) => Promise<void>
}

interface EditMemoryModalProps {
  visible: boolean
  memory: MemoryItem | null
  onCancel: () => void
  onUpdate: (id: string, memory: string, metadata?: Record<string, any>) => Promise<void>
}

interface AddUserModalProps {
  visible: boolean
  onCancel: () => void
  onAdd: (userId: string) => void
  existingUsers: string[]
}

const AddMemoryModal: React.FC<AddMemoryModalProps> = ({ visible, onCancel, onAdd }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  const handleSubmit = async (values: { memory: string }) => {
    setLoading(true)
    try {
      await onAdd(values.memory)
      form.resetFields()
      onCancel()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <PlusOutlined style={{ color: 'var(--color-primary)' }} />
          <span>{t('memory.add_memory')}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={600}
      styles={{
        header: {
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 16
        },
        body: {
          paddingTop: 24
        }
      }}
      footer={[
        <Button key="cancel" size="large" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" size="large" loading={loading} onClick={() => form.submit()}>
          {t('common.add')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={t('memory.memory_content')}
          name="memory"
          rules={[{ required: true, message: t('memory.please_enter_memory') }]}>
          <TextArea
            rows={5}
            placeholder={t('memory.memory_placeholder')}
            style={{ fontSize: '15px', lineHeight: '1.6' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const EditMemoryModal: React.FC<EditMemoryModalProps> = ({ visible, memory, onCancel, onUpdate }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (memory && visible) {
      form.setFieldsValue({
        memory: memory.memory,
        userId: memory.metadata?.userId || ''
      })
    }
  }, [memory, visible, form])

  const handleSubmit = async (values: { memory: string; userId?: string }) => {
    if (!memory) return

    setLoading(true)
    try {
      const metadata = values.userId ? { userId: values.userId } : undefined
      await onUpdate(memory.id, values.memory, metadata)
      form.resetFields()
      onCancel()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <EditOutlined style={{ color: 'var(--color-primary)' }} />
          <span>{t('memory.edit_memory')}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={600}
      styles={{
        header: {
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 16
        },
        body: {
          paddingTop: 24
        }
      }}
      footer={[
        <Button key="cancel" size="large" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" size="large" loading={loading} onClick={() => form.submit()}>
          {t('common.save')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={t('memory.memory_content')}
          name="memory"
          rules={[{ required: true, message: t('memory.please_enter_memory') }]}>
          <TextArea
            rows={5}
            placeholder={t('memory.memory_placeholder')}
            style={{ fontSize: '15px', lineHeight: '1.6' }}
          />
        </Form.Item>
        <Form.Item label={t('memory.user_id')} name="userId">
          <Input placeholder={t('memory.user_id_placeholder')} size="large" prefix={<UserOutlined />} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

const AddUserModal: React.FC<AddUserModalProps> = ({ visible, onCancel, onAdd, existingUsers }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  const handleSubmit = async (values: { userId: string }) => {
    setLoading(true)
    try {
      await onAdd(values.userId.trim())
      form.resetFields()
      onCancel()
    } finally {
      setLoading(false)
    }
  }

  const validateUserId = (_: any, value: string) => {
    if (!value || !value.trim()) {
      return Promise.reject(new Error(t('memory.user_id_required')))
    }
    const trimmedValue = value.trim()
    if (trimmedValue === 'default-user') {
      return Promise.reject(new Error(t('memory.user_id_reserved')))
    }
    if (existingUsers.includes(trimmedValue)) {
      return Promise.reject(new Error(t('memory.user_id_exists')))
    }
    if (trimmedValue.length > 50) {
      return Promise.reject(new Error(t('memory.user_id_too_long')))
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedValue)) {
      return Promise.reject(new Error(t('memory.user_id_invalid_chars')))
    }
    return Promise.resolve()
  }

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined style={{ color: 'var(--color-primary)' }} />
          <span>{t('memory.add_user')}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={500}
      styles={{
        header: {
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 16
        },
        body: {
          paddingTop: 24
        }
      }}
      footer={[
        <Button key="cancel" size="large" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" size="large" loading={loading} onClick={() => form.submit()}>
          {t('common.add')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label={t('memory.new_user_id')} name="userId" rules={[{ validator: validateUserId }]}>
          <Input
            placeholder={t('memory.new_user_id_placeholder')}
            maxLength={50}
            size="large"
            prefix={<UserOutlined />}
          />
        </Form.Item>
        <div
          style={{
            marginBottom: 16,
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-background-soft)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
          {t('memory.user_id_rules')}
        </div>
      </Form>
    </Modal>
  )
}

const MemoriesPage = () => {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const currentUser = useSelector(selectCurrentUserId)

  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [addMemoryModalVisible, setAddMemoryModalVisible] = useState(false)
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null)
  const [addUserModalVisible, setAddUserModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([])
  const memoryService = MemoryService.getInstance()

  // Utility functions
  const getUserDisplayName = (user: string) => {
    return user === 'default-user' ? t('memory.default_user') : user
  }

  const getUserAvatar = (user: string) => {
    return user === 'default-user' ? user.slice(0, 1).toUpperCase() : user.slice(0, 2).toUpperCase()
  }

  // Load memories function - now independent of currentUser in dependencies
  const loadMemories = useCallback(
    async (userId?: string) => {
      const targetUser = userId || currentUser
      console.log('Loading memories for user:', targetUser)
      setLoading(true)
      try {
        // First, ensure the memory service is using the correct user
        memoryService.setCurrentUser(targetUser)

        // Get all memories to extract unique users (not filtered by current user)
        const allResult = await window.api.memory.list({ limit: 1000 })

        // Extract unique user IDs from all memories
        const users = new Set<string>()
        allResult.memories?.forEach((memory) => {
          if (memory.metadata?.userId) {
            users.add(memory.metadata.userId)
          }
        })
        setUniqueUsers(Array.from(users))

        // Get memories for current user context
        const result = await memoryService.list({ limit: 1000 })
        console.log('Loaded memories for user:', targetUser, 'count:', result.results?.length || 0)
        setMemories(result.results || [])
      } catch (error) {
        console.error('Failed to load memories:', error)
        message.error(t('memory.load_failed'))
      } finally {
        setLoading(false)
      }
    },
    [memoryService, t]
  )

  // Sync memoryService with Redux store on mount and when currentUser changes
  useEffect(() => {
    console.log('useEffect triggered for currentUser:', currentUser)
    loadMemories(currentUser)
  }, [currentUser, loadMemories])

  // Initial load on mount
  useEffect(() => {
    console.log('Initial load on mount')
    loadMemories()
  }, [])

  // Filter memories based on search criteria (no user filter needed - already filtered by service)
  const filteredMemories = memories.filter((memory) => {
    // Search text filter
    if (searchText && !memory.memory.toLowerCase().includes(searchText.toLowerCase())) {
      return false
    }

    // Date range filter
    if (dateRange && dateRange.length === 2 && memory.createdAt) {
      const memoryDate = dayjs(memory.createdAt)
      if (!memoryDate.isAfter(dateRange[0]) || !memoryDate.isBefore(dateRange[1])) {
        return false
      }
    }

    return true
  })

  const handleSearch = (value: string) => {
    setSearchText(value)
  }

  const handleDateChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]])
    } else {
      setDateRange(null)
    }
  }

  const resetFilters = () => {
    setSearchText('')
    setDateRange(null)
  }

  const handleAddMemory = async (memory: string) => {
    try {
      // The memory service will automatically use the current user from its state
      await memoryService.add(memory, {})
      message.success(t('memory.add_success'))
      await loadMemories()
    } catch (error) {
      console.error('Failed to add memory:', error)
      message.error(t('memory.add_failed'))
    }
  }

  const handleDeleteMemory = async (id: string) => {
    try {
      await memoryService.delete(id)
      message.success(t('memory.delete_success'))
      await loadMemories()
    } catch (error) {
      console.error('Failed to delete memory:', error)
      message.error(t('memory.delete_failed'))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedRowKeys.length === 0) return

    Modal.confirm({
      title: t('memory.delete_confirm_title'),
      content: t('memory.delete_confirm_content', { count: selectedRowKeys.length }),
      onOk: async () => {
        try {
          await Promise.all(selectedRowKeys.map((id) => memoryService.delete(id)))
          message.success(t('memory.delete_success'))
          setSelectedRowKeys([])
          await loadMemories()
        } catch (error) {
          console.error('Failed to delete memories:', error)
          message.error(t('memory.delete_failed'))
        }
      }
    })
  }

  const handleEditMemory = (memory: MemoryItem) => {
    setEditingMemory(memory)
  }

  const handleUpdateMemory = async (id: string, memory: string, metadata?: Record<string, any>) => {
    try {
      await memoryService.update(id, memory, metadata)
      message.success(t('memory.update_success'))
      setEditingMemory(null)
      await loadMemories()
    } catch (error) {
      console.error('Failed to update memory:', error)
      message.error(t('memory.update_failed'))
    }
  }

  const handleUserSwitch = async (userId: string) => {
    console.log('Switching to user:', userId)

    // First update Redux state
    dispatch(setCurrentUserId(userId))

    // Clear current memories to show loading state immediately
    setMemories([])
    setSelectedRowKeys([])

    try {
      // Explicitly load memories for the new user
      await loadMemories(userId)

      message.success(
        t('memory.user_switched', { user: userId === 'default-user' ? t('memory.default_user') : userId })
      )
    } catch (error) {
      console.error('Failed to switch user:', error)
      message.error(t('memory.user_switch_failed'))
    }
  }

  const handleAddUser = async (userId: string) => {
    try {
      await handleUserSwitch(userId)
      message.success(t('memory.user_created', { user: userId }))
      setAddUserModalVisible(false)
    } catch (error) {
      console.error('Failed to add user:', error)
      message.error(t('memory.add_user_failed'))
    }
  }

  const handleSettingsSubmit = async () => {
    setSettingsModalVisible(false)
    await memoryService.updateConfig()
  }

  const handleSettingsCancel = () => {
    setSettingsModalVisible(false)
    form.resetFields()
  }

  const getMemoryActionMenuItems = (memory: MemoryItem): MenuProps['items'] => [
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <EditOutlined />,
      onClick: () => handleEditMemory(memory)
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: t('memory.delete_confirm'),
          content: t('memory.delete_confirm_single'),
          onOk: () => handleDeleteMemory(memory.id),
          okText: t('common.yes'),
          cancelText: t('common.no')
        })
      }
    }
  ]

  const renderMemoryCards = () => {
    if (loading) {
      return (
        <LoadingContainer>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>{t('memory.loading_memories')}</div>
        </LoadingContainer>
      )
    }

    if (filteredMemories.length === 0) {
      return (
        <EmptyStateContainer>
          <div className="empty-icon">📚</div>
          <div className="empty-title">
            {memories.length === 0 ? t('memory.no_memories') : t('memory.no_matching_memories')}
          </div>
          <div className="empty-description">
            {memories.length === 0 ? t('memory.no_memories_description') : t('memory.try_different_filters')}
          </div>
          {memories.length === 0 && (
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setAddMemoryModalVisible(true)}>
              {t('memory.add_first_memory')}
            </Button>
          )}
        </EmptyStateContainer>
      )
    }

    return (
      <Row gutter={[16, 16]}>
        {filteredMemories.map((memory) => (
          <Col key={memory.id} xs={24} sm={24} md={12} lg={8} xl={8}>
            <MemoryCard>
              <div className="memory-header">
                <Space className="memory-meta">
                  <ClockCircleOutlined />
                  <span>{memory.createdAt ? dayjs(memory.createdAt).fromNow() : '-'}</span>
                  {memory.metadata?.userId && (
                    <>
                      <UserOutlined />
                      <Tag color="blue" style={{ margin: 0 }}>
                        {memory.metadata.userId}
                      </Tag>
                    </>
                  )}
                </Space>
                <Dropdown
                  menu={{ items: getMemoryActionMenuItems(memory) }}
                  trigger={['click']}
                  placement="bottomRight">
                  <Button type="text" icon={<MoreOutlined />} size="small" />
                </Dropdown>
              </div>

              <Paragraph className="memory-content" ellipsis={{ rows: 3, expandable: true }}>
                {memory.memory}
              </Paragraph>

              <div className="memory-actions">
                {memory.score && <span className="score-badge">Score: {memory.score.toFixed(3)}</span>}
                <Space>
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditMemory(memory)}>
                    {t('common.edit')}
                  </Button>
                </Space>
              </div>
            </MemoryCard>
          </Col>
        ))}
      </Row>
    )
  }

  return (
    <Layout>
      <StyledContent>
        {/* Header Section */}
        <HeaderCard>
          <div className="header-main">
            <div className="header-left">
              <Title level={2} className="header-title">
                {t('memory.memories')}
              </Title>
              <Text className="header-description">
                {t('memory.memories_description', { count: filteredMemories.length, total: memories.length })}
              </Text>
              <div className="header-stats">
                <span>
                  <UserOutlined style={{ marginRight: 4 }} />
                  {uniqueUsers.length + 1} {uniqueUsers.length === 0 ? t('memory.user') : t('memory.users')}
                </span>
                <span>
                  📚 {memories.length} {t('memory.total_memories')}
                </span>
              </div>
            </div>
            <div className="header-actions">
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setAddMemoryModalVisible(true)}>
                {t('memory.add_memory')}
              </Button>
              <Tooltip title={t('common.settings')}>
                <Button
                  shape="circle"
                  size="large"
                  icon={<SettingOutlined />}
                  onClick={() => setSettingsModalVisible(true)}
                />
              </Tooltip>
              <Tooltip title={t('common.refresh')}>
                <Button
                  shape="circle"
                  size="large"
                  icon={<ReloadOutlined />}
                  loading={loading}
                  onClick={loadMemories}
                />
              </Tooltip>
            </div>
          </div>

          <div className="user-section">
            <div className="user-info">
              <Avatar className="user-avatar" size={40}>
                {getUserAvatar(currentUser)}
              </Avatar>
              <div className="user-details">
                <h4>{getUserDisplayName(currentUser)}</h4>
                <p>{t('memory.current_user')}</p>
              </div>
            </div>
            <div className="user-controls">
              <Select
                value={currentUser}
                onChange={handleUserSwitch}
                style={{ minWidth: 180 }}
                placeholder={t('memory.select_user')}
                size="large"
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                      <Button
                        type="text"
                        icon={<UserAddOutlined />}
                        onClick={() => setAddUserModalVisible(true)}
                        style={{ width: '100%', textAlign: 'left' }}>
                        {t('memory.add_new_user')}
                      </Button>
                    </div>
                  </>
                )}>
                <Option value="default-user">
                  <Space>
                    <Avatar size={20} className="user-avatar">
                      {getUserAvatar('default-user')}
                    </Avatar>
                    <span>{t('memory.default_user')}</span>
                    <Tag color="blue" size="small">
                      {t('memory.default')}
                    </Tag>
                  </Space>
                </Option>
                {uniqueUsers.map((user) => (
                  <Option key={user} value={user}>
                    <Space>
                      <Avatar size={20} className="user-avatar">
                        {getUserAvatar(user)}
                      </Avatar>
                      <span>{user}</span>
                      <Tag color="green" size="small">
                        {t('memory.custom')}
                      </Tag>
                    </Space>
                  </Option>
                ))}
              </Select>
              <Button
                type="default"
                icon={<UserAddOutlined />}
                onClick={() => setAddUserModalVisible(true)}
                size="large">
                {t('memory.add_user')}
              </Button>
            </div>
          </div>
        </HeaderCard>

        {/* Filter Section */}
        <FilterCard>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder={t('memory.search_placeholder')}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
                size="large"
                prefix={<SearchOutlined />}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <RangePicker
                style={{ width: '100%' }}
                size="large"
                value={dateRange}
                onChange={handleDateChange}
                placeholder={[t('memory.start_date'), t('memory.end_date')]}
                suffixIcon={<CalendarOutlined />}
              />
            </Col>
            <Col xs={24} sm={12} md={12} lg={12}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                {selectedRowKeys.length > 0 && (
                  <Button danger onClick={handleDeleteSelected}>
                    {t('memory.delete_selected')} ({selectedRowKeys.length})
                  </Button>
                )}
                <Button onClick={resetFilters}>{t('memory.reset_filters')}</Button>
              </Space>
            </Col>
          </Row>
        </FilterCard>

        {/* Memory Cards Section */}
        {renderMemoryCards()}

        {/* Add Memory Modal */}
        <AddMemoryModal
          visible={addMemoryModalVisible}
          onCancel={() => setAddMemoryModalVisible(false)}
          onAdd={handleAddMemory}
        />

        {/* Edit Memory Modal */}
        <EditMemoryModal
          visible={!!editingMemory}
          memory={editingMemory}
          onCancel={() => setEditingMemory(null)}
          onUpdate={handleUpdateMemory}
        />

        {/* Add User Modal */}
        <AddUserModal
          visible={addUserModalVisible}
          onCancel={() => setAddUserModalVisible(false)}
          onAdd={handleAddUser}
          existingUsers={[...uniqueUsers, 'default-user']}
        />

        {/* Settings Modal */}
        <MemoriesSettingsModal
          visible={settingsModalVisible}
          onSubmit={async () => await handleSettingsSubmit()}
          onCancel={handleSettingsCancel}
          form={form}
        />
      </StyledContent>
    </Layout>
  )
}

export default MemoriesPage
