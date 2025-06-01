import React, { FC } from 'react'
import { TravelButton } from '@/shared/ui/Button/Button'
import { Button, Flex, Popconfirm } from 'antd'
import { FaRegTrashAlt } from 'react-icons/fa'
import { QuestionCircleOutlined } from '@ant-design/icons'
import styles from './style.module.scss'
import cn from 'classnames'

export interface FormButtonsProps {
  onClose: () => void
  onAccept: () => void
  isLoading?: boolean
  isEdit?: boolean
  deleteText?: string
  onDelete?: () => void
  className?: string
}

export const FormButtons: FC<FormButtonsProps> = ({
  onAccept,
  onClose,
  isLoading = false,
  isEdit = false,
  deleteText,
  onDelete,
  className,
}: FormButtonsProps) => {
  return (
    <div className={cn(className, styles.container)}>
      {isEdit && onDelete && (
        <div className={styles.deleteContainer}>
          <Flex justify="end">
            <Popconfirm
              title={deleteText}
              description={'Вы уверены?'}
              icon={<QuestionCircleOutlined style={{ color: 'red' }} />}
              onConfirm={onDelete}
              okText={'Удалить'}
              okButtonProps={{ style: { background: 'red' } }}
              cancelText={'Отмена'}
              onCancel={e => {
                e?.preventDefault()
                e?.stopPropagation()
              }}
            >
              <Button
                aria-label={'Удалить бронь'}
                type="text"
                icon={<FaRegTrashAlt />}
                style={{ color: 'red' }}
              >
                {deleteText}
              </Button>
            </Popconfirm>
          </Flex>
        </div>
      )}
      <Flex justify="space-between">
        <TravelButton
          style={{ color: 'red', borderColor: 'red' }}
          size="s"
          view="secondary"
          label="Отмена"
          onClick={onClose}
          disabled={isLoading}
        />
        <TravelButton
          size="s"
          label={isEdit ? 'Сохранить' : 'Добавить'}
          onClick={onAccept}
          loading={isLoading}
        />
      </Flex>
    </div>
  )
}
