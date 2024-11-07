"use client";
import { type ChangeEvent, forwardRef } from "react";
import { classNames } from "@/components/utils/classNames";

type InputProps = {
  label?: JSX.Element | JSX.Element[];
  pattern?: string;
  disabled?: boolean;
  placeholder: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  precision?: number;
  step?: number;
  name: string;
  className?: string;
  children?: JSX.Element | JSX.Element[] | null;
  ref?: any;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

// Use with Formik
const NumericInput: React.FC<InputProps> = 
  forwardRef<HTMLInputElement, InputProps>(
  function NumericInput(
    {
      label,
      pattern,
      disabled,
      placeholder,
      min,
      max,
      minLength,
      maxLength,
      precision,
      step,
      name,
      className,
      children,
      onChange,
      onFocus,
      onBlur,
    },
    ref
  ) {
    // const [field] = useField(name)

    return (
      <div>
        {label && (
          <label
            htmlFor={name}
            className="block font-semibold  text-sm mb-1.5 w-full"
          >
            {label}
          </label>
        )}
        <div className="flex relative w-full">
          <input
            pattern={pattern ? pattern : "^[0-9]*[.,]?[0-9]*$"}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            placeholder={placeholder}
            autoCorrect="off"
            min={min}
            max={max}
            minLength={minLength}
            maxLength={maxLength}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) => {
              replaceComma(event);
              limitDecimalPlaces(event, precision as number);
            }}
            onFocus={onFocus}
            onBlur={onBlur}
            type="text"
            step={step}
            name={name}
            id={name}
            ref={ref}
            className={classNames(
              "disabled:cursor-not-allowed h-12 leading-4 bg-level-1 shadow-sm placeholder:text-muted-3 focus:ring-foreground focus:border-foreground block min-w-0 rounded-lg font-semibold border-0",
              className
            )}
            // onChange={onChange ? onChange : e => {
            //     /^[0-9]*[.,]?[0-9]*$/.test(e.target.value) && handleChange(e);
            // }}
          />
          {children && <>{children}</>}
        </div>
      </div>
    );
  }
);

function limitDecimalPlaces(e: React.ChangeEvent<HTMLInputElement>, count: number) {
  if (e.target.value.indexOf(".") == -1) {
    return;
  }
  if (e.target.value.length - e.target.value.indexOf(".") > count) {
    e.target.value = ParseFloat(e.target.value, count) + ''
  }
}

function ParseFloat(str: string, val: number) {
  str = str.toString();
  str = str.slice(0, str.indexOf(".") + val + 1);
  return Number(str);
}

function replaceComma(e: React.ChangeEvent<HTMLInputElement>) {
  var val = e.target.value;
  if (val.match(/\,/)) {
    val = val.replace(/\,/g, ".");
    e.target.value = val;
  }
}

export default NumericInput
