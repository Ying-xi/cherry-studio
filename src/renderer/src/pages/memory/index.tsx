import {
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
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
const { Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

// Styled Components
const StyledContent = styled(Content)`
  padding: 24px;
  background: var(--color-background);
  min-height: 100vh;
`

const HeaderSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px 0;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--color-border);

  .header-left {
    flex: 1;
  }

  .header-title {
    color: var(--color-text);
    margin: 0 0 8px 0;
    font-weight: 600;
    font-size: 32px;
    line-height: 1.2;
  }

  .header-subtitle {
    color: var(--color-text-secondary);
    margin: 0;
    font-size: 16px;
    font-weight: 400;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .user-selector {
    min-width: 200px;
  }

  .user-avatar {
    background: var(--color-primary);
    color: white;
  }
`

const SearchSection = styled.div`
  margin-bottom: 32px;
  display: flex;
  justify-content: center;

  .search-input {
    max-width: 600px;
    width: 100%;
  }
`

const MemoryCard = styled(Card)`
  background: #ffffff;
  border: 1px solid #f0f0f0;
  border-radius: 16px;
  margin-bottom: 24px;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    border-color: var(--color-primary);
    transform: translateY(-4px);
  }

  .ant-card-body {
    padding: 28px;
  }

  .memory-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .memory-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text-tertiary);
    font-size: 13px;
    font-weight: 500;
  }

  .memory-content {
    color: var(--color-text);
    font-size: 16px;
    line-height: 1.7;
    margin: 0;
    font-weight: 400;
  }

  .memory-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: 20px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover .memory-actions {
    opacity: 1;
  }
`

const EmptyStateContainer = styled.div`
  text-align: center;
  padding: 120px 20px;

  .empty-icon {
    font-size: 72px;
    margin-bottom: 24px;
    opacity: 0.6;
  }

  .empty-title {
    color: var(--color-text);
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 12px;
    line-height: 1.3;
  }

  .empty-description {
    color: var(--color-text-secondary);
    font-size: 16px;
    margin-bottom: 32px;
    max-width: 400px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.5;
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
        memory: memory.memory
      })
    }
  }, [memory, visible, form])

  const handleSubmit = async (values: { memory: string }) => {
    if (!memory) return

    setLoading(true)
    try {
      await onUpdate(memory.id, values.memory)
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
  const [searchText, setSearchText] = useState('')
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

  // Load unique users from database
  const loadUniqueUsers = useCallback(async () => {
    try {
      const usersList = await memoryService.getUsersList()
      const users = usersList.map((user) => user.userId)
      setUniqueUsers(users)
    } catch (error) {
      console.error('Failed to load users list:', error)
    }
  }, [memoryService])

  // Load memories function
  const loadMemories = useCallback(
    async (userId?: string) => {
      const targetUser = userId || currentUser
      console.log('Loading memories for user:', targetUser)
      setLoading(true)
      try {
        // First, ensure the memory service is using the correct user
        memoryService.setCurrentUser(targetUser)

        // Load unique users efficiently from database
        await loadUniqueUsers()

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
    [currentUser, memoryService, t, loadUniqueUsers]
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
  }, [loadMemories])

  // Filter memories based on search criteria (no user filter needed - already filtered by service)
  const filteredMemories = memories.filter((memory) => {
    // Search text filter
    if (searchText && !memory.memory.toLowerCase().includes(searchText.toLowerCase())) {
      return false
    }

    return true
  })

  const handleSearch = (value: string) => {
    setSearchText(value)
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
      // Create the user by adding an initial memory with the userId
      // This implicitly creates the user in the system
      await memoryService.setCurrentUser(userId)
      await memoryService.add(t('memory.initial_memory_content'), { userId })

      // Refresh the users list from the database to persist the new user
      await loadUniqueUsers()

      // Switch to the newly created user
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

  const handleDeleteUser = async (userId: string) => {
    if (userId === 'default-user') {
      message.error(t('memory.cannot_delete_default_user'))
      return
    }

    Modal.confirm({
      title: t('memory.delete_user_confirm_title'),
      content: t('memory.delete_user_confirm_content', { user: userId }),
      icon: <ExclamationCircleOutlined />,
      okText: t('common.yes'),
      cancelText: t('common.no'),
      okType: 'danger',
      onOk: async () => {
        try {
          await memoryService.deleteUser(userId)
          message.success(t('memory.user_deleted', { user: userId }))

          // Refresh the users list from database after deletion
          await loadUniqueUsers()

          // Switch to default user if current user was deleted
          if (currentUser === userId) {
            await handleUserSwitch('default-user')
          } else {
            await loadMemories()
          }
        } catch (error) {
          console.error('Failed to delete user:', error)
          message.error(t('memory.delete_user_failed'))
        }
      }
    })
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
      <Row gutter={[24, 24]}>
        {filteredMemories.map((memory) => (
          <Col key={memory.id} xs={24} sm={24} md={12} lg={8}>
            <MemoryCard>
              <div className="memory-header">
                <div className="memory-meta">
                  <ClockCircleOutlined />
                  <span>{memory.createdAt ? dayjs(memory.createdAt).fromNow() : '-'}</span>
                </div>
                <Dropdown
                  menu={{ items: getMemoryActionMenuItems(memory) }}
                  trigger={['click']}
                  placement="bottomRight">
                  <Button type="text" icon={<MoreOutlined />} size="small" />
                </Dropdown>
              </div>

              <Paragraph className="memory-content" ellipsis={{ rows: 4, expandable: true, symbol: 'more' }}>
                {memory.memory}
              </Paragraph>

              <div className="memory-actions">
                <Space size="small">
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
        {/* Clean Header Section */}
        <HeaderSection>
          <div className="header-left">
            <h1 className="header-title">{t('memory.memories')}</h1>
            <p className="header-subtitle">
              {memories.length} {memories.length === 1 ? t('memory.memory') : t('memory.memories')} •{' '}
              {getUserDisplayName(currentUser)}
            </p>
          </div>
          <div className="header-actions">
            <Select
              value={currentUser}
              onChange={handleUserSwitch}
              className="user-selector"
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
                </Space>
              </Option>
              {uniqueUsers.map((user) => (
                <Option key={user} value={user}>
                  <Space>
                    <Avatar size={20} className="user-avatar">
                      {getUserAvatar(user)}
                    </Avatar>
                    <span>{user}</span>
                  </Space>
                </Option>
              ))}
            </Select>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'settings',
                    label: t('common.settings'),
                    icon: <SettingOutlined />,
                    onClick: () => setSettingsModalVisible(true)
                  },
                  {
                    key: 'refresh',
                    label: t('common.refresh'),
                    icon: <ReloadOutlined />,
                    onClick: () => loadMemories()
                  },
                  ...(currentUser !== 'default-user'
                    ? [
                        {
                          key: 'deleteUser',
                          label: t('memory.delete_user'),
                          icon: <UserDeleteOutlined />,
                          danger: true,
                          onClick: () => handleDeleteUser(currentUser)
                        }
                      ]
                    : [])
                ]
              }}
              trigger={['click']}
              placement="bottomRight">
              <Button type="text" icon={<MoreOutlined />} size="large" />
            </Dropdown>
            <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setAddMemoryModalVisible(true)}>
              {t('memory.add_memory')}
            </Button>
          </div>
        </HeaderSection>

        {/* Clean Search Section */}
        <SearchSection>
          <Input
            className="search-input"
            placeholder={t('memory.search_placeholder')}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            allowClear
            size="large"
            prefix={<SearchOutlined />}
          />
        </SearchSection>

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
