import { forwardRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';

/**
 * Campo para digitar um código de acesso.
 *
 * O código vem do banco já agrupado de quatro em quatro (ABCD-EFGH), com um
 * alfabeto sem caracteres que se confundem — nada de I, L, O, zero e um. Aqui
 * o campo devolve o favor: aceita colar com ou sem hífen, com espaços, em
 * minúsculas, e vai formatando enquanto a pessoa digita.
 */

const LIMPAR = /[^A-Za-z0-9]/g;

function formatar(bruto: string, maximo: number): string {
  const limpo = bruto.replace(LIMPAR, '').toUpperCase().slice(0, maximo);
  return limpo.replace(/(.{4})(?=.)/g, '$1-');
}

export interface CodeInputProps {
  value: string;
  onChange: (valor: string) => void;
  onEnter?: () => void;
  id?: string;
  /** quantidade de caracteres úteis (sem os hífens) */
  maxLength?: number;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}

export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { value, onChange, onEnter, id, maxLength = 12, invalid, className, placeholder = 'ABCD-EFGH', ...rest },
  ref,
) {
  const aoDigitar = (evento: ChangeEvent<HTMLInputElement>) => {
    onChange(formatar(evento.target.value, maxLength));
  };

  const aoColar = (evento: ClipboardEvent<HTMLInputElement>) => {
    evento.preventDefault();
    onChange(formatar(evento.clipboardData.getData('text'), maxLength));
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === 'Enter' && onEnter) {
      evento.preventDefault();
      onEnter();
    }
  };

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="text"
      autoComplete="one-time-code"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={aoDigitar}
      onPaste={aoColar}
      onKeyDown={aoTeclar}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      className={clsx(
        'field text-center font-mono text-[1.125rem] font-semibold uppercase tracking-[0.18em]',
        invalid && 'field-error',
        className,
      )}
      {...rest}
    />
  );
});
