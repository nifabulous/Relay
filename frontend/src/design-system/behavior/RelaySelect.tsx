import { Select } from "@base-ui/react/select";

export interface RelaySelectOption {
  value: string;
  label: string;
}

export interface RelaySelectProps {
  ariaLabel: string;
  value: string;
  options: RelaySelectOption[];
  onValueChange: (value: string) => void;
  triggerClassName?: string;
}

/**
 * Relay's single select boundary. Feature code chooses *when* a control opens
 * and what its options mean; this wrapper owns Base UI wiring and the stable
 * styling hooks so selects stay consistent across surfaces.
 */
export function RelaySelect({
  ariaLabel,
  value,
  options,
  onValueChange,
  triggerClassName,
}: RelaySelectProps) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") onValueChange(nextValue);
      }}
    >
      <Select.Trigger className={triggerClassName} aria-label={ariaLabel}>
        <span className="relay-select__value">{selected?.label}</span>
        <Select.Icon className="relay-select__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} className="relay-select__positioner">
          <Select.Popup className="relay-select__popup">
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="relay-select__item">
                  <Select.ItemIndicator className="relay-select__indicator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m20 6-11 11-5-5" />
                    </svg>
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

export default RelaySelect;
