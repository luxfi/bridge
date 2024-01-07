
import { useSettingsState } from '../../../context/settings';
import { CalculateFee, CalculateReceiveAmount } from '../../../lib/fees';
import { SwapFormValues } from '../../DTOs/SwapFormValues';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@luxdefi/ui/primitives';
import { ReceiveAmounts } from './ReceiveAmounts';
import DetailedEstimates from './DetailedEstimates';
import Campaign from './Campaign';

export default function FeeDetails({ values }: { values: SwapFormValues }) {
    const { networks, currencies } = useSettingsState()
    const { currency, from, to, refuel } = values || {}

    let fee = CalculateFee(values, networks);
    let receive_amount = CalculateReceiveAmount(values, networks, currencies);
    return (
        <>
            <div className="mx-auto relative w-full rounded-lg bg-level-2 border border-level-3 hover:border-level-4 px-3.5 py-3 z-[1] transition-all duration-200">
                    {/* @ts-ignore */}
                <Accordion type="single" collapsible>
                    {/* @ts-ignore */}
                    <AccordionItem value='item-1'>
                    {/* @ts-ignore */}
                    <AccordionTrigger className="items-center flex w-full relative gap-2 rounded-lg text-left text-base font-medium">
                            <ReceiveAmounts
                                currencies={currencies}
                                currency={currency}
                                to={to}
                                receive_amount={receive_amount}
                                refuel={!!refuel}
                            />
                        </AccordionTrigger>
                    {/* @ts-ignore */}
                    <AccordionContent className="text-sm text-foreground text-foreground-new font-normal">
                            <DetailedEstimates
                                currencies={currencies}
                                networks={networks}
                                fee={fee}
                                selected_currency={currency}
                                source={from}
                                destination={to}
                            />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
            {
                values.to &&
                values.currency &&
                <Campaign
                    destination={values.to}
                    selected_currency={values.currency}
                    fee={fee}
                />
            }
        </>
    )
}
