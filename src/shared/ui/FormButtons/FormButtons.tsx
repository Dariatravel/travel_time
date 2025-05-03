import React, { FC } from 'react'
import { Grid, GridItem } from '@consta/uikit/Grid'
import { TravelButton } from '@/shared/ui/Button/Button'
import { Button, Popconfirm } from 'antd'
import { FaRegTrashAlt } from 'react-icons/fa'
import { QuestionCircleOutlined } from '@ant-design/icons'

export interface FormButtonsProps {
  onClose: () => void
  onAccept: () => void
  isLoading?: boolean
  isEdit?: boolean
  deleteText?: string
  onDelete?: () => void
}

export const FormButtons: FC<FormButtonsProps> = ({
  onAccept,
  onClose,
  isLoading = false,
  isEdit = false,
  deleteText,
  onDelete,
}: FormButtonsProps) => {
  return (
    <>
      {isEdit && onDelete && (
        <Grid cols={2}>
          <GridItem colStart={2}>
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
                type="text"
                icon={<FaRegTrashAlt />}
                style={{ color: 'red' }}
              >
                {deleteText}
              </Button>
            </Popconfirm>
          </GridItem>
        </Grid>
      )}
      <Grid cols={2}>
        <GridItem>
          <TravelButton
            style={{ color: 'red', borderColor: 'red' }}
            size="s"
            view="secondary"
            label="Отмена"
            onClick={onClose}
            disabled={isLoading}
          />
        </GridItem>
        <GridItem style={{ alignSelf: 'end' }}>
          <TravelButton
            size="s"
            label={isEdit ? 'Сохранить' : 'Добавить'}
            onClick={onAccept}
            loading={isLoading}
          />
        </GridItem>
      </Grid>
    </>
  )
}
