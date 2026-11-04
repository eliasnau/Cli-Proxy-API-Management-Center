import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import { devicesApi, type DevicePriceRule } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import styles from './DevicesPage.module.scss';

const priceFields = ['input', 'output', 'cacheWrite', 'cacheRead'] as const;

export function PricingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [rules, setRules] = useState<DevicePriceRule[]>([]);
  const [defaults, setDefaults] = useState<DevicePriceRule[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    devicesApi
      .getPricing()
      .then((pricing) => {
        setRules(pricing.rules);
        setDefaults(pricing.defaults);
      })
      .catch((error) => showNotification(getErrorMessage(error), 'error'));
  }, [open, showNotification]);

  const update = (index: number, patch: Partial<DevicePriceRule>) =>
    setRules((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const save = async (next: DevicePriceRule[]) => {
    setSaving(true);
    try {
      const pricing = await devicesApi.savePricing(next);
      setRules(pricing.rules);
      showNotification(t('devices.pricing_saved'), 'success');
      onClose();
    } catch (error) {
      showNotification(getErrorMessage(error, t('devices.save_failed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('devices.pricing_title')}
      onClose={onClose}
      width={760}
      closeDisabled={saving}
      footer={
        <>
          <Button variant="ghost" onClick={() => setRules(defaults)} disabled={saving}>
            {t('devices.pricing_reset')}
          </Button>
          <Button onClick={() => void save(rules)} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{t('devices.pricing_desc')}</p>
      <table className={`${styles.table} ${styles.priceTable}`}>
        <thead>
          <tr>
            <th>{t('devices.price_match')}</th>
            <th>{t('devices.price_input')}</th>
            <th>{t('devices.price_output')}</th>
            <th>{t('devices.price_cache_write')}</th>
            <th>{t('devices.price_cache_read')}</th>
            <th aria-label={t('devices.delete')} />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={index}>
              <td>
                <input
                  className={styles.cellInput}
                  value={rule.match}
                  aria-label={t('devices.price_match')}
                  onChange={(e) => update(index, { match: e.target.value })}
                />
              </td>
              {priceFields.map((field) => (
                <td key={field}>
                  <input
                    className={styles.cellInput}
                    type="number"
                    min={0}
                    step="0.01"
                    value={rule[field]}
                    aria-label={field}
                    onChange={(e) => update(index, { [field]: Number(e.target.value) || 0 })}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  aria-label={t('devices.delete')}
                  onClick={() => setRules((list) => list.filter((_, i) => i !== index))}
                >
                  <IconTrash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          setRules((list) => [
            ...list,
            { match: '', input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
          ])
        }
      >
        <IconPlus size={15} />
        {t('devices.price_add')}
      </Button>
    </Modal>
  );
}
