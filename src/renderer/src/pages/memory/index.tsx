import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  UserAddOutlined,
  UserSwitchOutlined
} from '@ant-design/icons'
import MemoryService from '@renderer/services/MemoryService'
import { MemoryItem } from '@types'
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Layout,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import MemoriesSettingsModal from './settings-modal'

dayjs.extend(relativeTime)

const { Content } = Layout
const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Option } = Select
const { TextArea } = Input

interface AddMemoryModalProps {
  visible: boolean
  onCancel: () => void
  onAdd: (memory: string, userId?: string) => Promise<void>
}

interface EditMemoryModalProps {
  visible: boolean
  memory: MemoryItem | null
  onCancel: () => void
  onUpdate: (id: string, memory: string, metadata?: Record<string, any>) => Promise<void>
}

interface UserSwitchComponentProps {
  currentUser: string
  users: string[]
  onUserChange: (userId: string) => void
  onAddUser: (userId: string) => void
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

  const handleSubmit = async (values: { memory: string; userId?: string }) => {
    setLoading(true)
    try {
      await onAdd(values.memory, values.userId)
      form.resetFields()
      onCancel()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={t('memory.add_memory')}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
          {t('common.add')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={t('memory.memory_content')}
          name="memory"
          rules={[{ required: true, message: t('memory.please_enter_memory') }]}>
          <TextArea rows={4} placeholder={t('memory.memory_placeholder')} />
        </Form.Item>
        <Form.Item label={t('memory.user_id')} name="userId">
          <Input placeholder={t('memory.user_id_placeholder')} />
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
      title={t('memory.edit_memory')}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
          {t('common.save')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={t('memory.memory_content')}
          name="memory"
          rules={[{ required: true, message: t('memory.please_enter_memory') }]}>
          <TextArea rows={4} placeholder={t('memory.memory_placeholder')} />
        </Form.Item>
        <Form.Item label={t('memory.user_id')} name="userId">
          <Input placeholder={t('memory.user_id_placeholder')} />
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
      title={t('memory.add_user')}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={() => form.submit()}>
          {t('common.add')}
        </Button>
      ]}>
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label={t('memory.new_user_id')} name="userId" rules={[{ validator: validateUserId }]}>
          <Input placeholder={t('memory.new_user_id_placeholder')} maxLength={50} />
        </Form.Item>
        <div style={{ marginBottom: 16, fontSize: '12px', color: '#666' }}>{t('memory.user_id_rules')}</div>
      </Form>
    </Modal>
  )
}

const UserSwitchComponent: React.FC<UserSwitchComponentProps> = ({ currentUser, users, onUserChange, onAddUser }) => {
  const { t } = useTranslation()
  const [addUserModalVisible, setAddUserModalVisible] = useState(false)

  const handleAddUser = (userId: string) => {
    onAddUser(userId)
    setAddUserModalVisible(false)
  }

  const handleDropdownVisibleChange = (open: boolean) => {
    if (open) {
      // Optionally do something when dropdown opens
    }
  }

  return (
    <>
      <Space>
        <UserSwitchOutlined />
        <Text strong>{t('memory.current_user')}:</Text>
        <Select
          value={currentUser}
          onChange={onUserChange}
          style={{ minWidth: 160 }}
          placeholder={t('memory.select_user')}
          onDropdownVisibleChange={handleDropdownVisibleChange}
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
              <span>{t('memory.default_user')}</span>
              <Tag color="blue">{t('memory.default')}</Tag>
            </Space>
          </Option>
          {users.map((user) => (
            <Option key={user} value={user}>
              <Space>
                <span>{user}</span>
                <Tag color="green">{t('memory.custom')}</Tag>
              </Space>
            </Option>
          ))}
        </Select>
        <Button
          type="text"
          icon={<UserAddOutlined />}
          onClick={() => setAddUserModalVisible(true)}
          title={t('memory.add_new_user')}>
          {t('memory.add_user')}
        </Button>
      </Space>

      <AddUserModal
        visible={addUserModalVisible}
        onCancel={() => setAddUserModalVisible(false)}
        onAdd={handleAddUser}
        existingUsers={[...users, 'default-user']}
      />
    </>
  )
}

const MemoriesPage = () => {
  const { t } = useTranslation()
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [selectedUser, setSelectedUser] = useState('all')
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [addMemoryModalVisible, setAddMemoryModalVisible] = useState(false)
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null)
  const [form] = Form.useForm()
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState('default-user')
  const memoryService = MemoryService.getInstance()

  // Load memories on mount and when config changes
  const loadMemories = useCallback(async () => {
    setLoading(true)
    try {
      // Get all memories to extract unique users (not filtered by current user)
      const allResult = await window.api.memory.list({ limit: 1000 })

      // Extract unique user IDs from all memories
      const users = new Set<string>()
      // window.api.memory.list returns SearchResult with 'memories' property
      allResult.memories?.forEach((memory) => {
        if (memory.metadata?.userId) {
          users.add(memory.metadata.userId)
        }
      })
      setUniqueUsers(Array.from(users))

      // Get memories for current context
      // memoryService.list returns MemorySearchResult with 'results' property
      const result = await memoryService.list({ limit: 1000 })
      setMemories(result.results || [])
    } catch (error) {
      console.error('Failed to load memories:', error)
      message.error(t('memory.load_failed'))
    } finally {
      setLoading(false)
    }
  }, [memoryService, t])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  // Filter memories based on search criteria
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

    // User filter
    if (selectedUser !== 'all' && memory.metadata?.userId !== selectedUser) {
      return false
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

  const handleUserChange = (value: string) => {
    setSelectedUser(value)
  }

  const resetFilters = () => {
    setSearchText('')
    setDateRange(null)
    setSelectedUser('all')
  }

  const handleAddMemory = async (memory: string, userId?: string) => {
    try {
      const metadata = userId ? { userId } : undefined
      await memoryService.add(memory, { metadata })
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

  const handleUserSwitch = (userId: string) => {
    setCurrentUser(userId)
    memoryService.setCurrentUser(userId)
    // Filter memories based on the selected user
    if (userId === 'default-user') {
      setSelectedUser('all')
    } else {
      setSelectedUser(userId)
    }
    // Reload memories with new user context
    loadMemories()
    message.success(t('memory.user_switched', { user: userId === 'default-user' ? t('memory.default_user') : userId }))
  }

  const handleAddUser = async (userId: string) => {
    try {
      // Switch to the new user immediately
      handleUserSwitch(userId)
      message.success(t('memory.user_created', { user: userId }))
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

  const columns: ColumnsType<MemoryItem> = [
    {
      title: t('memory.time'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (text: string) => (text ? dayjs(text).fromNow() : '-'),
      sorter: (a, b) => {
        if (!a.createdAt || !b.createdAt) return 0
        return dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix()
      }
    },
    {
      title: t('memory.user'),
      dataIndex: ['metadata', 'userId'],
      key: 'userId',
      width: 120,
      render: (userId: string) => (userId ? <Tag color="blue">{userId}</Tag> : <Tag color="default">-</Tag>),
      filters: uniqueUsers.map((user) => ({ text: user, value: user })),
      onFilter: (value, record) => record.metadata?.userId === value
    },
    {
      title: t('memory.content'),
      dataIndex: 'memory',
      key: 'memory',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: t('memory.score'),
      dataIndex: 'score',
      key: 'score',
      width: 80,
      render: (score: number) => (score ? score.toFixed(3) : '-'),
      sorter: (a, b) => (a.score || 0) - (b.score || 0)
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditMemory(record)} />
          </Tooltip>
          <Popconfirm
            title={t('memory.delete_confirm')}
            onConfirm={() => handleDeleteMemory(record.id)}
            okText={t('common.yes')}
            cancelText={t('common.no')}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[])
  }

  return (
    <Layout style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <Content style={{ padding: '24px 50px' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Header Section */}
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={2} style={{ margin: 0 }}>
                {t('memory.memories')}
              </Title>
              <Text type="secondary">
                {t('memory.memories_description', { count: filteredMemories.length, total: memories.length })}
              </Text>
            </Col>
            <Col>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemoryModalVisible(true)}>
                  {t('memory.add_memory')}
                </Button>
                <Tooltip title={t('common.settings')}>
                  <Button shape="circle" icon={<SettingOutlined />} onClick={() => setSettingsModalVisible(true)} />
                </Tooltip>
                <Tooltip title={t('common.refresh')}>
                  <Button shape="circle" icon={<ReloadOutlined />} loading={loading} onClick={loadMemories} />
                </Tooltip>
              </Space>
            </Col>
          </Row>

          {/* User Switch Section */}
          <Row justify="center">
            <Col>
              <UserSwitchComponent
                currentUser={currentUser}
                users={uniqueUsers}
                onUserChange={handleUserSwitch}
                onAddUser={handleAddUser}
              />
            </Col>
          </Row>

          {/* Filter Section */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder={t('memory.search_placeholder')}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                allowClear
                prefix={<SearchOutlined />}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={handleDateChange}
                placeholder={[t('memory.start_date'), t('memory.end_date')]}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Select defaultValue="all" style={{ width: '100%' }} onChange={handleUserChange} value={selectedUser}>
                <Option value="all">
                  {t('memory.all_users')} ({uniqueUsers.length} {t('memory.users')})
                </Option>
                {uniqueUsers.map((user) => (
                  <Option key={user} value={user}>
                    {user}
                  </Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={24} lg={6} style={{ textAlign: 'right' }}>
              <Space>
                {selectedRowKeys.length > 0 && (
                  <Button danger onClick={handleDeleteSelected}>
                    {t('memory.delete_selected')} ({selectedRowKeys.length})
                  </Button>
                )}
                <Button onClick={resetFilters}>{t('memory.reset_filters')}</Button>
              </Space>
            </Col>
          </Row>

          {/* Table Section */}
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredMemories}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                t('memory.pagination_total', {
                  start: range[0],
                  end: range[1],
                  total
                })
            }}
            bordered
          />
        </Space>

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

        {/* Settings Modal */}
        <MemoriesSettingsModal
          visible={settingsModalVisible}
          onSubmit={async () => await handleSettingsSubmit()}
          onCancel={handleSettingsCancel}
          form={form}
        />
      </Content>
    </Layout>
  )
}

export default MemoriesPage
