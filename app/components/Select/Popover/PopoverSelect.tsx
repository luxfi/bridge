import { SelectProps } from '../Shared/Props/SelectProps'
import { CommandItem, CommandList, CommandWrapper } from '../../shadcn/command';
import SelectItem from '../Shared/SelectItem';

export default function PopoverSelect<T>({ values, value, setValue }: SelectProps<T>) {

    return (
        <CommandWrapper>
            <CommandList>
                {values.map(item =>
                    <CommandItem disabled={!item.isAvailable.value} value={item.id} key={item.id} onSelect={() => {
                        setValue(item)
                    }}>
                        <SelectItem<T> item={item} />
                    </CommandItem>)
                }
            </CommandList>
        </CommandWrapper>
    )
}

export enum LayerDisabledReason {
    LockNetworkIsTrue = '',
    InsufficientLiquidity = 'Temporarily disabled. Please check later.'
}