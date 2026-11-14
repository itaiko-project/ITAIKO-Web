import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { NumericFormat, type NumericFormatProps } from "react-number-format"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface NumberInputProps
  extends Omit<NumericFormatProps, "value" | "onValueChange"> {
  stepper?: number
  value?: number
  onValueChange?: (value: number | undefined) => void
  min?: number
  max?: number
  suffix?: string
  prefix?: string
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      stepper = 1,
      min = -Infinity,
      max = Infinity,
      onValueChange,
      value,
      className,
      suffix,
      prefix,
      decimalScale = 0,
      fixedDecimalScale = false,
      disabled,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<number | undefined>(value)

    React.useEffect(() => {
      setInternalValue(value)
    }, [value])

    const handleIncrement = () => {
      if (disabled) return
      const currentValue = internalValue ?? 0
      const newValue = Math.min(currentValue + stepper, max)
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    const handleDecrement = () => {
      if (disabled) return
      const currentValue = internalValue ?? 0
      const newValue = Math.max(currentValue - stepper, min)
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    const handleChange: NonNullable<NumericFormatProps["onValueChange"]> = (values, sourceInfo) => {
      // Slider/config updates also trigger NumericFormat's callback. Echoing those
      // back to the parent can overwrite newer values and create extra commits.
      if (sourceInfo.source !== "event") return
      const newValue = values.floatValue
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    const handleBlur = () => {
      if (internalValue !== undefined) {
        if (internalValue < min) {
          setInternalValue(min)
          onValueChange?.(min)
        } else if (internalValue > max) {
          setInternalValue(max)
          onValueChange?.(max)
        }
      }
    }

    // Handle keyboard arrow keys
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        handleIncrement()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        handleDecrement()
      }
    }

    return (
      <div
        className={cn(
          "group flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs ring-offset-background focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <NumericFormat
          getInputRef={ref}
          value={internalValue}
          onValueChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          decimalScale={decimalScale}
          fixedDecimalScale={fixedDecimalScale}
          allowNegative={min < 0}
          max={max}
          min={min}
          suffix={suffix}
          prefix={prefix}
          disabled={disabled}
          customInput={Input}
          className="h-full flex-1 border-0 bg-transparent px-3 py-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
          {...props}
        />
        <div className="flex h-full flex-col border-l border-input">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-1/2 w-6 rounded-none rounded-tr-md border-b border-input px-0 hover:bg-accent focus:z-10 focus-visible:ring-inset focus-visible:ring-ring/50"
            onClick={handleIncrement}
            disabled={disabled || (internalValue !== undefined && internalValue >= max)}
            tabIndex={-1}
          >
            <ChevronUp className="h-3 w-3" />
            <span className="sr-only">Increase</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-1/2 w-6 rounded-none rounded-br-md px-0 hover:bg-accent focus:z-10 focus-visible:ring-inset focus-visible:ring-ring/50"
            onClick={handleDecrement}
            disabled={disabled || (internalValue !== undefined && internalValue <= min)}
            tabIndex={-1}
          >
            <ChevronDown className="h-3 w-3" />
            <span className="sr-only">Decrease</span>
          </Button>
        </div>
      </div>
    )
  }
)
NumberInput.displayName = "NumberInput"
