'use client';

import type { MenuPreviewDish, OrderQuoteResponse } from '@fernleaf/contracts';
import { Button } from '@/components/ui/button';
import { money } from '@/features/configuration/common';
import type { EditableLine } from './builder-input';
import styles from './orders.module.css';

export function OrderLinesEditor({ lines, dishes, previous, disabled, onChange }: {
  lines: EditableLine[]; dishes: MenuPreviewDish[]; previous?: OrderQuoteResponse | null; disabled: boolean;
  onChange: (lines: EditableLine[]) => void;
}) {
  function changeLine(index: number, value: EditableLine) { onChange(lines.map((line, position) => position === index ? value : line)); }
  return <>{lines.map((line, lineIndex) => {
    const dish = dishes.find((value) => value.menuItemId === line.menuItemId);
    const recorded = previous?.lines.find((value) => value.menuItemId === line.menuItemId);
    const title = dish?.name ?? recorded?.dish.name ?? 'Saved dish unavailable in the current menu';
    const allocated = line.combinations.reduce((total, combination) => total + (Number(combination.quantity) || 0), 0);
    return <fieldset key={line.key} className={styles.line} aria-label={`Line ${lineIndex + 1}`} disabled={disabled}>
      <legend>Line {lineIndex + 1} · {title}</legend>
      <div className={styles.lineHeader}><div><h3>{title}</h3>{dish && <p>{dish.sku} · base {money(dish.priceMinor)} · minimum {dish.minQuantity ?? 1} meal(s)</p>}</div><Button type="button" variant="ghost" className={styles.remove} onClick={() => onChange(lines.filter((_, index) => index !== lineIndex))}>Remove dish</Button></div>
      {!dish && <p className="allergy-warning">This saved dish is unavailable in the current employee menu. Remove it or restore its menu configuration before saving. The recorded purchase remains available on the order detail.</p>}
      {dish?.allergyWarnings.length ? <p className="allergy-warning">Allergen warning: {dish.allergyWarnings.join(', ')}</p> : null}
      {dish?.dietaryTags.length ? <p className={styles.muted}>Dietary tags: {dish.dietaryTags.join(', ')}</p> : null}
      <label className="form-field" htmlFor={`line-${line.key}-quantity`}>Line {lineIndex + 1} quantity<input id={`line-${line.key}-quantity`} type="number" min="1" max="100000" step="1" value={line.quantity} onChange={(event) => changeLine(lineIndex, { ...line, quantity: event.target.value })} /></label>
      <div className={styles.combinations}><p className={styles.muted}>Split this quantity between option combinations. Each required group needs one option in every combination; optional groups allow zero or one. The server merges identical combinations.</p>
        {line.combinations.map((combination, combinationIndex) => {
          function changeCombination(value: typeof combination) { changeLine(lineIndex, { ...line, combinations: line.combinations.map((entry, index) => index === combinationIndex ? value : entry) }); }
          const currentGroupIds = new Set(dish?.groups.map((group) => group.id));
          const retired = combination.selections.filter((selection) => !currentGroupIds.has(selection.groupId));
          return <fieldset key={combination.key} className={styles.combination} aria-label={`Combination ${combinationIndex + 1}`}>
            <legend>Combination {combinationIndex + 1}</legend><div className={styles.toolbar}><strong>Combination {combinationIndex + 1}</strong><Button type="button" variant="ghost" className={styles.remove} onClick={() => changeLine(lineIndex, { ...line, combinations: line.combinations.filter((_, index) => index !== combinationIndex) })}>Remove combination</Button></div>
            <div className="form-grid"><label className="form-field" htmlFor={`combination-${combination.key}-quantity`}>Combination {combinationIndex + 1} quantity<input id={`combination-${combination.key}-quantity`} type="number" min="1" max="100000" step="1" value={combination.quantity} onChange={(event) => changeCombination({ ...combination, quantity: event.target.value })} /></label>
              {dish?.groups.map((group) => {
                // Portion groups offer one choice per option × size, encoded as "optionId|portionSizeId".
                const current = combination.selections.find((selection) => selection.groupId === group.id);
                const selected = current ? `${current.optionId}${current.portionSizeId ? `|${current.portionSizeId}` : ''}` : '';
                const usesPortions = group.portionSizes.length > 0;
                const choices = usesPortions
                  ? group.options.flatMap((option) => option.portions.map((portion) => ({ value: `${option.id}|${portion.portionSizeId}`, label: `${option.name} · ${portion.name} · +${money(option.priceMinor + portion.surchargeMinor)}`, option })))
                  : group.options.map((option) => ({ value: option.id, label: `${option.name} · +${money(option.priceMinor)}`, option }));
                return <label key={group.id} className="form-field" htmlFor={`${combination.key}-${group.id}`}><span id={`${combination.key}-${group.id}-label`}>{group.name} for combination {combinationIndex + 1}</span><select id={`${combination.key}-${group.id}`} aria-labelledby={`${combination.key}-${group.id}-label`} aria-describedby={`${combination.key}-${group.id}-help`} value={selected} onChange={(event) => { const [optionId, portionSizeId] = event.target.value.split('|'); changeCombination({ ...combination, selections: [...combination.selections.filter((selection) => selection.groupId !== group.id), ...(optionId ? [{ groupId: group.id, optionId, ...(portionSizeId ? { portionSizeId } : {}) }] : [])] }); }}><option value="">{group.required ? 'Choose one required option' : 'No option'}</option>{selected && !choices.some((choice) => choice.value === selected) && <option value={selected}>Saved option is no longer available</option>}{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}{choice.option.allergyWarnings.length ? ` · Allergen: ${choice.option.allergyWarnings.join(', ')}` : ''}</option>)}</select><span id={`${combination.key}-${group.id}-help`} className="field-help">{group.required ? 'Required · Choose exactly one' : 'Optional · Choose zero or one'}{usesPortions ? ` · Sizes: ${group.portionSizes.map((size) => size.name).join(', ')}` : ''}</span></label>;
              })}
            </div>
            {retired.length > 0 && <div className={`${styles.notice} ${styles.warning}`}><p>This combination has saved choices from replaced groups. Clear these retired choices, then select from the current groups before requesting a fresh quote.</p><Button type="button" variant="secondary" onClick={() => changeCombination({ ...combination, selections: combination.selections.filter((selection) => currentGroupIds.has(selection.groupId)) })}>Clear retired choices</Button></div>}
          </fieldset>;
        })}
        <p className={allocated === Number(line.quantity) ? styles.muted : 'allergy-warning'}>{allocated} of {line.quantity || '0'} meals allocated. Combination quantities must add up to the line quantity.</p>
        <Button type="button" variant="secondary" onClick={() => changeLine(lineIndex, { ...line, combinations: [...line.combinations, { key: crypto.randomUUID(), quantity: '1', selections: [] }] })}>Add combination</Button>
      </div>
    </fieldset>;
  })}{!lines.length && <p className={styles.empty}>No dishes added. You can save an empty draft; placement requires at least one valid dish.</p>}</>;
}
