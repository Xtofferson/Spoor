import { createElement } from 'react';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/** The @expo/ui picker renders nothing on web, so use the browser's native date input. */
export function DateField({ value, onChange }: DateFieldProps) {
  const theme = useTheme();

  return createElement('input', {
    type: 'date',
    value,
    'aria-label': 'Start date',
    required: true,
    onChange: (event: { target: { value: string } }) => {
      if (event.target.value) onChange(event.target.value);
    },
    style: {
      fontFamily: Fonts.sans,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      accentColor: theme.accent,
      border: 'none',
      borderRadius: Spacing.two,
      padding: `${Spacing.two + Spacing.one}px ${Spacing.three}px`,
    },
  });
}
