import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";

interface Friend {
  id: string;
  name: string;
  email: string | null;
  balanceOwed: number;
}

export default function Friends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const load = () => {
    api
      .get("/friends")
      .then((res) => setFriends(res.data))
      .catch((err) => console.error("Failed to load friends:", err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError("");
    try {
      await api.post("/friends", { name, email: email || undefined });
      setName("");
      setEmail("");
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to add friend");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (f: Friend) => {
    setEditingId(f.id);
    setEditName(f.name);
    setEditEmail(f.email || "");
  };

  const handleSaveEdit = async (friendId: string) => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/friends/${friendId}`, { name: editName, email: editEmail || null });
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update friend");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (friendId: string) => {
    if (!confirm("Remove this friend permanently? Their balance history will be lost.")) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/friends/${friendId}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete friend");
    } finally {
      setBusy(false);
    }
  };

  const totalOwed = friends.reduce((sum, f) => sum + f.balanceOwed, 0);

  return (
    <div className="min-h-screen bg-cream px-6 py-8 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="font-hand text-5xl text-moss">your friends</h1>
          <Link to="/" className="font-body text-moss underline">
            back to bills
          </Link>
        </div>

        {friends.length > 0 && (
          <p className="font-mono text-sm text-coral">
            total owed to you: ₹{totalOwed.toFixed(2)}
          </p>
        )}

        {error && <p className="text-coral font-body text-sm">{error}</p>}

        <form onSubmit={handleAdd} className="bg-paper rounded-2xl p-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="friend's name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-body flex-1 px-4 py-2 rounded-lg border border-moss/30 bg-cream"
            data-gramm="false"
          />
          <input
            type="email"
            placeholder="email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="font-body flex-1 px-4 py-2 rounded-lg border border-moss/30 bg-cream"
            data-gramm="false"
          />
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="font-body font-semibold bg-leaf text-white px-6 py-2 rounded-lg hover:bg-moss transition-colors disabled:opacity-50"
          >
            {adding ? "adding..." : "+ add"}
          </button>
        </form>

        {loading ? (
          <p className="font-body text-ink/60">loading friends...</p>
        ) : friends.length === 0 ? (
          <p className="font-body text-ink/60">no friends added yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {friends.map((f) => (
              <div key={f.id} className="bg-paper rounded-xl p-4">
                {editingId === f.id ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="font-body flex-1 px-3 py-1.5 rounded-lg border border-moss/30 bg-cream text-sm"
                      data-gramm="false"
                    />
                    <input
                      type="email"
                      placeholder="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="font-body flex-1 px-3 py-1.5 rounded-lg border border-moss/30 bg-cream text-sm"
                      data-gramm="false"
                    />
                    <button
                      onClick={() => handleSaveEdit(f.id)}
                      disabled={busy}
                      className="font-body text-xs px-3 py-1.5 rounded-full bg-leaf text-white disabled:opacity-50"
                    >
                      save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="font-body text-xs px-3 py-1.5 rounded-full border border-moss/30 text-moss"
                    >
                      cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-between items-center gap-2">
                    <div>
                      <h2 className="font-hand text-2xl text-moss">{f.name}</h2>
                      {f.email && <p className="font-body text-xs text-ink/50">{f.email}</p>}
                      <p className={`font-mono text-sm mt-1 ${f.balanceOwed > 0 ? "text-coral" : "text-ink/40"}`}>
                        {f.balanceOwed > 0 ? `owes ₹${f.balanceOwed.toFixed(2)}` : "settled up"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(f)}
                        className="font-body text-xs px-3 py-1.5 rounded-full border border-moss/30 text-moss hover:bg-moss hover:text-white transition-colors"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={busy}
                        className="font-body text-xs px-3 py-1.5 rounded-full border border-coral text-coral hover:bg-coral hover:text-white transition-colors disabled:opacity-50"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}