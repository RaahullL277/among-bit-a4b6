import { useState } from 'react';
import { UserPlus, Users, Trash2, Mail } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Modal,
  Spinner,
  ErrorBanner,
  Badge,
  EmptyState,
} from '../components/ui';

const ROLES = ['OWNER', 'ADMIN', 'STAFF'];

export default function Team() {
  const { me } = useAuth();
  const { data: members, loading, error, reload } = useAsync(() => api.members.list(), []);
  const { data: invites, reload: reloadInvites } = useAsync(() => api.members.listInvites(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'STAFF' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [createdLink, setCreatedLink] = useState('');

  async function invite(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.members.createInvite(form);
      setOpen(false);
      setForm({ email: '', role: 'STAFF' });
      if (res.devLink) setCreatedLink(res.devLink);
      reloadInvites();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(userId, role) {
    await api.members.changeRole(userId, role);
    reload();
  }
  async function remove(userId) {
    await api.members.remove(userId);
    reload();
  }
  async function revoke(id) {
    await api.members.revokeInvite(id);
    reloadInvites();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Team</h1>
        <Button onClick={() => setOpen(true)}>
          <UserPlus size={15} /> Invite member
        </Button>
      </div>

      {createdLink && (
        <Card className="border-emerald-200 bg-emerald-50 p-5">
          <div className="text-sm font-medium text-emerald-800">Invite created. Dev link:</div>
          <code className="mt-2 block truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-700">
            {createdLink}
          </code>
        </Card>
      )}

      <Card>
        <CardHeader title="Members" subtitle="People with access to this workspace" />
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-5"><ErrorBanner message={error} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {members?.map((m) => {
                const isSelf = me?.id === m.userId;
                return (
                  <tr key={m.userId} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{m.name ?? m.email}</div>
                      <div className="text-xs text-slate-400">{m.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Select
                        value={m.role}
                        disabled={isSelf}
                        onChange={(e) => changeRole(m.userId, e.target.value)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => remove(m.userId)}
                          className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Pending invites" />
        {!invites?.length ? (
          <EmptyState icon={Mail} title="No pending invites" />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 text-slate-700">{i.email}</td>
                  <td className="px-5 py-3"><Badge>{i.role}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => revoke(i.id)}
                      className="text-xs text-rose-600 hover:text-rose-700"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Invite member">
        <form onSubmit={invite} className="space-y-4">
          <Field label="Email">
            <Input
              type="email"
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <ErrorBanner message={formError} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!form.email.trim()}>
              Send invite
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
