import { Field } from '@ark-ui/react'
import { cn } from 'cn'
import type * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface InputProps extends React.ComponentProps<'input'> {
  /**
   * Custom error message or dynamic error message resolver.
   * Defaults to `t('validation.required')` via i18n when omitted.
   */
  errorText?: React.ReactNode | ((value: string) => React.ReactNode)
  /**
   * Error predicate expression:
   * - `boolean`: directly controls the invalid state (e.g. `port < 1 || port > 65535`)
   * - `(value: string) => boolean`: predicate evaluated against the input value (`true` = invalid)
   */
  isInvalid?: boolean | ((value: string) => boolean)
  /**
   * Custom validation function (`true` / `null` / `undefined` = valid, `false` = invalid with `errorText`,
   * or return a custom error `string` directly).
   */
  validate?: (value: string) => boolean | string | null | undefined
  /**
   * When to trigger predicate evaluation:
   * - `'blur'` (default): validates on blur, then re-validates on change once touched
   * - `'change'`: validates on every change after first edit
   * - `'always'`: validates immediately on mount and every render
   */
  validateOn?: 'blur' | 'change' | 'always'
  /** Wrapper class name for `Field.Root`. */
  rootClassName?: string
}

function Input({
  className,
  rootClassName,
  type,
  value: controlledValue,
  defaultValue,
  errorText,
  isInvalid,
  validate,
  validateOn = 'blur',
  onChange,
  onBlur,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const { t } = useTranslation()
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(() =>
    defaultValue !== undefined ? String(defaultValue) : ''
  )
  const [touched, setTouched] = useState(validateOn === 'always')

  const isControlled = controlledValue !== undefined
  const currentValue = isControlled ? String(controlledValue ?? '') : uncontrolledValue

  // Evaluate validity and resolved error message from predicates
  const evaluateState = (
    val: string,
    shouldEvaluatePredicate: boolean
  ): { invalid: boolean; message: React.ReactNode } => {
    const resolvedFallbackError =
      typeof errorText === 'function' ? errorText(val) : (errorText ?? t('validation.required'))

    if (ariaInvalid === true || ariaInvalid === 'true') {
      return { invalid: true, message: resolvedFallbackError }
    }

    if (typeof isInvalid === 'boolean') {
      return { invalid: isInvalid, message: resolvedFallbackError }
    }

    if (!shouldEvaluatePredicate) {
      return { invalid: false, message: null }
    }

    if (typeof validate === 'function') {
      const result = validate(val)
      if (typeof result === 'string' && result.length > 0) {
        return { invalid: true, message: result }
      }
      if (result === false) {
        return { invalid: true, message: resolvedFallbackError }
      }
      return { invalid: false, message: null }
    }

    if (typeof isInvalid === 'function') {
      const invalid = isInvalid(val)
      return { invalid, message: invalid ? resolvedFallbackError : null }
    }

    // Default fallback when no custom predicate is provided: non-empty check on blur
    const emptyInvalid = !val.trim()
    return {
      invalid: emptyInvalid,
      message: emptyInvalid ? resolvedFallbackError : null
    }
  }

  const shouldEvaluate = validateOn === 'always' || touched
  const { invalid, message } = evaluateState(currentValue, shouldEvaluate)

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (!isControlled) {
      setUncontrolledValue(e.target.value)
    }
    if (validateOn === 'change') {
      setTouched(true)
    }
    onChange?.(e)
  }

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setTouched(true)
    onBlur?.(e)
  }

  return (
    <Field.Root invalid={invalid} className={cn('w-full', rootClassName)}>
      <Field.Input
        {...props}
        type={type}
        value={currentValue}
        aria-invalid={invalid || undefined}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          'h-9 w-full min-w-0 rounded-md border border-input',
          'bg-transparent px-3 py-1 text-base shadow-xs',
          'transition-[color,box-shadow] outline-none',
          'selection:bg-primary selection:text-primary-foreground',
          'file:inline-flex file:h-7 file:border-0 file:bg-transparent',
          'file:font-medium file:text-foreground file:text-sm',
          'placeholder:text-muted-foreground',
          'disabled:pointer-events-none disabled:cursor-not-allowed',
          'disabled:opacity-50 md:text-sm dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px]',
          'focus-visible:ring-ring/50',
          'aria-invalid:border-destructive',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className
        )}
      />

      {message && (
        <Field.ErrorText className="mt-1 block text-destructive text-xs">{message}</Field.ErrorText>
      )}
    </Field.Root>
  )
}

export { Input }
