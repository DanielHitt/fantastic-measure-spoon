import { useState } from 'react';
import { api } from '../api';
import type { Project } from '../types';
import { Button, Field, Modal, inputCls } from './ui';

export function AddProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState('');
  const [builder, setBuilder] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contact_name, setContactName] = useState('');
  const [contact_phone, setContactPhone] = useState('');
  const [contact_email, setContactEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function reset() {
    setName('');
    setBuilder('');
    setAddress('');
    setCity('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setErr('');
  }

  async function submit() {
    if (!name.trim()) {
      setErr('Project name is required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const p = await api.createProject({
        name: name.trim(),
        builder: builder.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        contact_name: contact_name.trim() || undefined,
        contact_phone: contact_phone.trim() || undefined,
        contact_email: contact_email.trim() || undefined,
      });
      onCreated(p);
      reset();
      onClose();
    } catch (e: any) {
      setErr(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a job site / project" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Project name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marpac White Center Hub Housing"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Builder / GC">
          <input value={builder} onChange={(e) => setBuilder(e.target.value)} placeholder="e.g. Marpac" className={inputCls} />
        </Field>
        <Field label="City">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Seattle" className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Street address">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 10821 8th Ave SW, Seattle, WA"
              className={inputCls}
            />
          </Field>
          <p className="mt-1 text-xs text-slate-400">
            The address is used to place the site on the map and route to it. A full street address gives the most
            accurate routing.
          </p>
        </div>
        <Field label="Site contact name">
          <input value={contact_name} onChange={(e) => setContactName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Contact phone">
          <input value={contact_phone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Contact email">
            <input value={contact_email} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>

      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !name.trim()}>
          Create job site
        </Button>
      </div>
    </Modal>
  );
}
