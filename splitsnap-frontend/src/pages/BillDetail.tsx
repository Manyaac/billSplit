import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useParams, Link, useNavigate } from "react-router-dom";

interface Friend {
  id: string;
  name: string;
  email: string | null;
  balanceOwed: number;
}

interface BillItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignedTo: Friend[];
}

interface Split {
  id: string;
  amountOwed: number;
  paid: boolean;
  friendId: string;
}

interface Bill {
  id: string;
  title: string | null;
  totalAmount: number;
  splitMode: "EQUAL" | "ITEMIZED";
  equalSplitCount: number | null;
  imageUrl: string | null;
  items: BillItem[];
  splits: Split[];
}

export default function BillDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bill, setBill] = useState<Bill | null>(null);
  const [allFriends, setAllFriends] = useState<Friend[]>([]);
  const [billFriendIds, setBillFriendIds] = useState<string[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [newFriendName, setNewFriendName] = useState("");
  const [newFriendEmail, setNewFriendEmail] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [editingEmailFor, setEditingEmailFor] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [sendingReminders, setSendingReminders] = useState(false);

  const load = () => {
    Promise.all([api.get(`/bills/${id}`), api.get("/friends")])
      .then(([billRes, friendsRes]) => {
        setBill(billRes.data);
        setAllFriends(friendsRes.data);

        const fromItems: string[] = billRes.data.items.flatMap((it: BillItem) =>
          it.assignedTo.map((a) => a.id)
        );
        const fromSplits: string[] = billRes.data.splits.map((s: Split) => s.friendId);
        setBillFriendIds((prev) => {
          const combined = new Set([...prev, ...fromItems, ...fromSplits]);
          return Array.from(combined);
        });

        if (billRes.data.equalSplitCount) setPeopleCount(billRes.data.equalSplitCount);
      })
      .catch((err) => console.error("Failed to load bill:", err))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const addFriendToBill = (friendId: string) => {
    setBillFriendIds((prev) => (prev.includes(friendId) ? prev : [...prev, friendId]));
  };

  const removeFriendFromBill = (friendId: string) => {
    setBillFriendIds((prev) => prev.filter((f) => f !== friendId));
    setSelectedFriends((prev) => prev.filter((f) => f !== friendId));
  };

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((f) => f !== friendId) : [...prev, friendId]
    );
  };

  const toggleItemAssignee = async (itemId: string, currentAssigned: string[], friendId: string) => {
    const newAssigned = currentAssigned.includes(friendId)
      ? currentAssigned.filter((f) => f !== friendId)
      : [...currentAssigned, friendId];
    try {
      await api.patch(`/items/${itemId}/assign`, { friendIds: newAssigned });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to assign item");
    }
  };

  const handleChangeSplitMode = async (mode: "EQUAL" | "ITEMIZED") => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/bills/${id}`, { splitMode: mode });
      setSelectedFriends([]);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to change split type");
    } finally {
      setBusy(false);
    }
  };

  const handleSplit = async () => {
    setBusy(true);
    setError("");
    try {
      if (bill && bill.splits.length > 0) {
        await api.delete(`/bills/${id}/split`);
      }
      await api.post(`/bills/${id}/split`, {
        friendIds: bill?.splitMode === "EQUAL" ? selectedFriends : undefined,
        peopleCount: bill?.splitMode === "EQUAL" ? peopleCount : undefined,
      });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to split bill");
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSplit = async (splitId: string) => {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/splits/${splitId}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to remove split");
    } finally {
      setBusy(false);
    }
  };

  const togglePaid = async (split: Split) => {
    setBusy(true);
    setError("");
    try {
      if (split.paid) {
        await api.patch(`/splits/${split.id}/unpay`);
      } else {
        await api.patch(`/splits/${split.id}/pay`);
      }
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update paid status");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEmail = async (friendId: string) => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/friends/${friendId}`, { email: emailDraft || null });
      setEditingEmailFor(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update email");
    } finally {
      setBusy(false);
    }
  };

  const handleSendReminders = async () => {
    setSendingReminders(true);
    setError("");
    try {
      const res = await api.post(`/bills/${id}/remind`);
      alert(
        `Sent ${res.data.sent} reminder(s)${
          res.data.skipped > 0 ? `, ${res.data.skipped} friend(s) have no email on file` : ""
        }`
      );
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  };

  const handleAddMyself = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/friends", { name: user?.username || "me" });
      addFriendToBill(res.data.id);
      load();
    } catch (err: any) {
      if (err.response?.status === 409) {
        const existing = allFriends.find(
          (f) => f.name.toLowerCase() === (user?.username || "me").toLowerCase()
        );
        if (existing) addFriendToBill(existing.id);
      } else {
        setError(err.response?.data?.error || "Failed to add yourself");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFriendName.trim()) return;
    setAddingFriend(true);
    setError("");
    try {
      const res = await api.post("/friends", {
        name: newFriendName,
        email: newFriendEmail || undefined,
      });
      setNewFriendName("");
      setNewFriendEmail("");
      addFriendToBill(res.data.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to add friend");
    } finally {
      setAddingFriend(false);
    }
  };

  const handleRename = async () => {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/bills/${id}`, { title: titleDraft });
      setEditingTitle(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to rename bill");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBill = async () => {
    if (!confirm("Delete this bill permanently? This can't be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await api.delete(`/bills/${id}`);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete bill");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="font-body p-8">loading bill...</p>;
  if (!bill) return <p className="font-body p-8">bill not found</p>;

  const friendName = (friendId: string) =>
    allFriends.find((f) => f.id === friendId)?.name || "unknown";

  const billFriends = allFriends.filter((f) => billFriendIds.includes(f.id));
  const notYetAdded = allFriends.filter((f) => !billFriendIds.includes(f.id));

  return (
    <div className="min-h-screen bg-cream px-6 py-8 flex flex-col items-center relative">
      <Link to="/" className="font-body text-moss underline self-start mb-4">
        ← back to bills
      </Link>

      <div className="bg-paper rounded-2xl p-8 w-full max-w-lg flex flex-col gap-4">
        {editingTitle ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              className="font-hand text-2xl text-moss px-2 py-1 rounded-lg border border-moss/30 bg-cream flex-1"
              data-gramm="false"
            />
            <button onClick={handleRename} disabled={busy} className="font-body text-xs px-3 py-1 rounded-full bg-leaf text-white disabled:opacity-50">
              save
            </button>
            <button onClick={() => setEditingTitle(false)} className="font-body text-xs px-3 py-1 rounded-full border border-moss/30 text-moss">
              cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <h1 className="font-hand text-4xl text-moss">{bill.title || "untitled bill"}</h1>
            <button
              onClick={() => { setTitleDraft(bill.title || ""); setEditingTitle(true); }}
              className="font-body text-xs text-ink/40 hover:text-moss underline"
            >
              edit
            </button>
          </div>
        )}

        <div className="flex justify-between items-center">
          <p className="font-mono text-coral text-xl">₹{bill.totalAmount.toFixed(2)}</p>
          <button
            type="button"
            onClick={handleDeleteBill}
            disabled={busy}
            className="font-body text-xs text-coral underline disabled:opacity-50"
          >
            delete this bill
          </button>
        </div>

        {error && <p className="text-coral font-body text-sm">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => handleChangeSplitMode("EQUAL")}
            disabled={busy}
            className={`font-body px-4 py-2 rounded-lg border text-sm ${bill.splitMode === "EQUAL" ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
          >
            equal split
          </button>
          <button
            onClick={() => handleChangeSplitMode("ITEMIZED")}
            disabled={busy}
            className={`font-body px-4 py-2 rounded-lg border text-sm ${bill.splitMode === "ITEMIZED" ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
          >
            itemized split
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {bill.items.map((item) => (
            <div key={item.id} className="border-b border-moss/10 pb-2">
              <div className="flex justify-between font-mono text-sm">
                <span>{item.name} × {item.quantity}</span>
                <span>₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
              {bill.splitMode === "ITEMIZED" && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {billFriends.length === 0 ? (
                    <p className="font-body text-xs text-ink/40 italic">
                      add friends from the panel to tag them here
                    </p>
                  ) : (
                    billFriends.map((f) => {
                      const isAssigned = (item.assignedTo ?? []).some((a) => a.id === f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleItemAssignee(item.id, (item.assignedTo ?? []).map((a) => a.id), f.id)}
                          className={`font-body text-xs px-3 py-1 rounded-full border ${isAssigned ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
                        >
                          {f.name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="font-body text-sm px-4 py-2 rounded-lg border border-moss/30 text-moss hover:bg-moss hover:text-white transition-colors self-start"
        >
          + manage friends for this bill
        </button>

        {billFriends.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {billFriends.map((f) => (
              <div key={f.id} className="flex items-center gap-1 bg-cream rounded-full pl-3 pr-1 py-1 text-xs font-body border border-moss/20">
                <span>{f.name}</span>
                <button
                  onClick={() => removeFriendFromBill(f.id)}
                  title="remove from this bill"
                  className="text-coral hover:bg-coral hover:text-white rounded-full w-4 h-4 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {bill.splitMode === "EQUAL" && (
          <div className="flex flex-col gap-2">
            <label className="font-body text-sm text-ink/70">how many people?</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={peopleCount === 0 ? "" : peopleCount}
              onChange={(e) => {
                const val = e.target.value;
                setPeopleCount(val === "" ? 0 : parseInt(val, 10));
              }}
              className="font-body px-3 py-1.5 rounded-lg border border-moss/30 bg-cream text-sm w-full sm:w-24"
            />
            <p className="font-mono text-xs text-coral">
              {peopleCount > 0 ? `₹${(bill.totalAmount / peopleCount).toFixed(2)} each` : "enter a number to see the split"}
            </p>
            {billFriends.length > 0 && (
              <>
                <p className="font-body text-xs text-ink/50 mt-1">tag friends to track their balance:</p>
                <div className="flex flex-wrap gap-2">
                  {billFriends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => toggleFriend(f.id)}
                      className={`font-body text-xs px-3 py-1 rounded-full border ${selectedFriends.includes(f.id) ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={handleSplit}
          disabled={busy || (bill.splitMode === "EQUAL" && peopleCount < 1)}
          className="font-body font-semibold bg-moss text-white py-2 rounded-lg hover:bg-moss/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-ink/20"
        >
          {busy ? "splitting..." : bill.splits.length > 0 ? "re-split with current selection" : "split this bill"}
        </button>
        {bill.splitMode === "EQUAL" && peopleCount < 1 && (
          <p className="font-body text-xs text-coral -mt-2">enter how many people first, above</p>
        )}

        {bill.splits.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="font-body text-sm text-ink/70">splits:</p>
            {bill.splits.map((split) => (
              <div key={split.id} className="flex justify-between items-center bg-cream rounded-lg px-4 py-2 gap-2">
                <span className="font-body text-sm flex-1">{friendName(split.friendId)}</span>
                <span className="font-mono text-sm text-coral">₹{split.amountOwed.toFixed(2)}</span>
                <button
                  onClick={() => togglePaid(split)}
                  disabled={busy}
                  className={`font-body text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${split.paid ? "border-leaf bg-leaf text-white" : "border-moss/30 text-moss hover:bg-moss hover:text-white"}`}
                >
                  {split.paid ? "paid ✓" : "mark paid"}
                </button>
                <button
                  onClick={() => handleRemoveSplit(split.id)}
                  disabled={busy}
                  className="font-body text-xs px-2 py-1 rounded-full text-coral hover:bg-coral hover:text-white transition-colors disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={handleSendReminders}
              disabled={sendingReminders}
              className="font-body text-sm px-4 py-2 rounded-lg border border-coral text-coral hover:bg-coral hover:text-white transition-colors disabled:opacity-50 self-start mt-1"
            >
              {sendingReminders ? "sending..." : "📧 send reminder emails"}
            </button>
          </div>
        )}
      </div>

      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} className="fixed inset-0 bg-ink/30 z-40" />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-80 bg-paper shadow-lg z-50 p-6 flex flex-col gap-4 transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex justify-between items-center">
          <h2 className="font-hand text-2xl text-moss">add friends</h2>
          <button onClick={() => setDrawerOpen(false)} className="text-ink/50 hover:text-coral text-xl">✕</button>
        </div>

        <button
          onClick={handleAddMyself}
          disabled={busy}
          className="font-body text-sm text-left px-3 py-2 rounded-lg border border-leaf bg-leaf/10 text-moss hover:bg-leaf hover:text-white transition-colors disabled:opacity-50"
        >
          + add myself
        </button>

        <p className="font-body text-xs text-ink/50">saved friends you've added before:</p>
        <div className="flex flex-col gap-2 overflow-y-auto flex-1">
          {notYetAdded.length === 0 ? (
            <p className="font-body text-xs text-ink/40 italic">
              {allFriends.length === 0 ? "no saved friends yet" : "all saved friends are already added"}
            </p>
          ) : (
            notYetAdded.map((f) => (
              <div key={f.id} className="flex flex-col gap-1 border border-moss/20 rounded-lg p-2">
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => addFriendToBill(f.id)}
                    className="font-body text-sm hover:text-leaf transition-colors"
                  >
                    + {f.name}
                  </button>
                  <button
                    onClick={() => {
                      setEditingEmailFor(f.id);
                      setEmailDraft(f.email || "");
                    }}
                    className="font-body text-xs text-ink/40 hover:text-moss underline"
                  >
                    {f.email ? "edit email" : "add email"}
                  </button>
                </div>
                {editingEmailFor === f.id && (
                  <div className="flex gap-1">
                    <input
                      type="email"
                      placeholder="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      className="font-body flex-1 px-2 py-1 rounded border border-moss/30 bg-cream text-xs"
                      data-gramm="false"
                    />
                    <button
                      onClick={() => handleSaveEmail(f.id)}
                      disabled={busy}
                      className="font-body text-xs px-2 py-1 rounded bg-leaf text-white disabled:opacity-50"
                    >
                      save
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-moss/10 pt-4">
          <p className="font-body text-xs text-ink/50 mb-2">or add someone new:</p>
          <form onSubmit={handleAddFriend} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="friend's name"
              value={newFriendName}
              onChange={(e) => setNewFriendName(e.target.value)}
              className="font-body px-3 py-1.5 rounded-lg border border-moss/30 bg-cream text-sm"
              data-gramm="false"
            />
            <input
              type="email"
              placeholder="email (optional)"
              value={newFriendEmail}
              onChange={(e) => setNewFriendEmail(e.target.value)}
              className="font-body px-3 py-1.5 rounded-lg border border-moss/30 bg-cream text-sm"
              data-gramm="false"
            />
            <button
              type="submit"
              disabled={addingFriend || !newFriendName.trim()}
              className="font-body text-sm px-4 py-1.5 rounded-lg bg-leaf text-white hover:bg-moss transition-colors disabled:opacity-50"
            >
              {addingFriend ? "adding..." : "+ add & include in this bill"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}