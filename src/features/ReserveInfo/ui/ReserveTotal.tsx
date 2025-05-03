import React, { FC, ReactNode, useMemo } from 'react'
import { Text } from '@consta/uikit/Text'
import moment from 'moment/moment'
import { Grid, GridItem } from '@consta/uikit/Grid'

export interface ReserveTotalProps {
  date: [Date?, Date?]
  price: number
  prepayment?: number
  Prepayment: ReactNode
  className?: string
}

export const ReserveTotal: FC<ReserveTotalProps> = ({
  date,
  prepayment = 0,
  price = 0,
  Prepayment,
  className,
}: ReserveTotalProps) => {
  const totalDays = useMemo(() => {
    if (date?.[0] && date?.[1]) {
      const [start, end] = date
      return moment(end).hour(12).diff(moment(start).hour(11), 'days')
    }

    return 0
  }, [date])

  const totalPrice = useMemo(() => totalDays * price, [totalDays, price])
  const remainPrice = useMemo(
    () => totalPrice - prepayment,
    [totalPrice, prepayment]
  )
  const postFix = 'руб.'

  const TEXT_SIZE = 's'
  return (
    <>
      <Grid cols={2} className={className}>
        <GridItem col={1}>
          <Text view={'success'} size={'m'}>
            Итого
          </Text>
        </GridItem>
        <GridItem col={1}>
          <Text view={'success'} size={'m'}>
            {totalPrice} {postFix}
          </Text>
        </GridItem>
        <GridItem col={1}>
          <Text size={TEXT_SIZE}>Количество ночей</Text>
        </GridItem>
        <GridItem col={1}>
          <Text size={TEXT_SIZE}>{totalDays}</Text>
        </GridItem>
        <GridItem col={1}>
          <Text size={TEXT_SIZE}>Внесено</Text>
        </GridItem>
        <GridItem col={1}>{Prepayment}</GridItem>
        <GridItem col={1}>
          <Text size={TEXT_SIZE}>Остаток</Text>
        </GridItem>
        <GridItem col={1}>
          <Text size={TEXT_SIZE}>
            {remainPrice} {postFix}
          </Text>
        </GridItem>
      </Grid>
    </>
  )
}
