import { type FormikErrors } from "formik";
import { type SwapFormValues } from "../components/DTOs/SwapFormValues";
import { isValidAddress } from "./addressValidator";

export default function MainStepValidation({ maxAllowedAmount, minAllowedAmount }: { minAllowedAmount: number | undefined, maxAllowedAmount: number | undefined }): ((values: SwapFormValues) => FormikErrors<SwapFormValues>) {
    return (values: SwapFormValues) => {
        let errors: FormikErrors<SwapFormValues> = {};
        let amount = Number(values.amount);

        console.log("validateor >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", values)

        if (!values.from && !values.fromExchange) {
            (errors.from as any) = 'Select source';
        }
        if (!values.fromCurrency && !values.currencyGroup) {
            (errors.fromCurrency as any) = 'Select source asset';
        }
        if (!values.to && !values.toExchange) {
            (errors.to as any) = 'Select destination';
        }
        if (!values.toCurrency && !values.currencyGroup) {
            (errors.toCurrency as any) = 'Select destination asset';
        }

        if (!amount) {
            errors.amount = 'Enter an amount';
        }
        if (!/^[0-9]*[.,]?[0-9]*$/i.test(amount.toString())) {
            errors.amount = 'Invalid amount';
        }
        if (amount < 0) {
            errors.amount = "Can't be negative";
        }
        if (maxAllowedAmount != undefined && amount > maxAllowedAmount) {
            errors.amount = `Max amount is ${maxAllowedAmount}`;
        }
        if (minAllowedAmount != undefined && amount < minAllowedAmount) {
            errors.amount = `Min amount is ${minAllowedAmount}`;
        }
        if (values.to || values.toExchange) {
            if (!values.destination_address) {
                errors.destination_address = `Enter ${values.to?.display_name ?? values?.toExchange?.display_name} address`;
            }
            else if (!isValidAddress(values.destination_address, values.to)) {
                errors.destination_address = `Enter a valid ${values.to?.display_name ?? values?.toExchange?.display_name} address`;
            }
        }

        if (Object.keys(errors).length === 0) return errors

        if (Object.keys(errors).length === 0) return errors

        return errors;
    };
}
