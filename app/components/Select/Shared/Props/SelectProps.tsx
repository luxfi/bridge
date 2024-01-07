import { SelectMenuItem } from '../../Shared/Props/selectMenuItem'

export interface SelectProps<T> {
    values: SelectMenuItem<T>[]
    value?: SelectMenuItem<T>
    setValue: (value: SelectMenuItem<T>) => void
}