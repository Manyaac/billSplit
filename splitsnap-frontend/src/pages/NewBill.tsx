import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import api from "../api/client";

interface ParsedItem {
  name: string;
  price: number;
  quantity: number;
}

interface Friend {
  id: string;
  name: string;
}

export default function NewBill() {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState("");
  const [splitMode, setSplitMode] = useState<"EQUAL" | "ITEMIZED">("EQUAL");
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  useEffect(() => {
    api.get("/friends").then((res) => setFriends(res.data)).catch(() => {});
  }, []);

  const toggleFriend = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId) ? prev.filter((f) => f !== friendId) : [...prev, friendId]
    );
  };

  const handleUploadAndParse = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const uploadRes = await api.post("/upload/receipt", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = uploadRes.data.url;
      setImageUrl(url);

      const parseRes = await api.post("/parse/receipt", { imageUrl: url });
      setItems(parseRes.data.items);
      setSubtotal(parseRes.data.subtotal);
      setTax(parseRes.data.tax);
      setTotal(parseRes.data.total);
      setStep("review");
    } catch (err: any) {
      setError(err.response?.data?.error || "Something went wrong reading the receipt");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBill = async () => {
    if (splitMode === "EQUAL" && peopleCount < 1) {
      setError("enter how many people you're splitting with");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const billRes = await api.post("/bills", {
        title: title || undefined,
        imageUrl,
        totalAmount: total,
        splitMode,
        items,
      });
      const billId = billRes.data.id;

      if (splitMode === "EQUAL") {
        await api.post(`/bills/${billId}/split`, {
          friendIds: selectedFriends,
          peopleCount,
        });
        navigate("/");
      } else {
        navigate(`/bills/${billId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to save bill");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream px-6 py-8 flex flex-col items-center">
      <h1 className="font-hand text-5xl text-moss mb-6">snap a receipt</h1>

      {error && <p className="text-coral font-body mb-4">{error}</p>}

      {step === "upload" && (
        <div className="bg-paper rounded-2xl p-8 w-full max-w-md flex flex-col gap-4 items-center">
          {/* Hidden inputs: one for camera, one for gallery */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            data-gramm="false"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            data-gramm="false"
          />

          {file && (
            <p className="font-body text-sm text-moss">{file.name}</p>
          )}

          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 font-body px-4 py-2 rounded-lg border border-moss/30 text-moss hover:bg-moss hover:text-white transition-colors"
            >
              📷 take a photo
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex-1 font-body px-4 py-2 rounded-lg border border-moss/30 text-moss hover:bg-moss hover:text-white transition-colors"
            >
              🖼️ choose from gallery
            </button>
          </div>

          <button
            onClick={handleUploadAndParse}
            disabled={!file || loading}
            className="font-body font-semibold bg-leaf text-white px-6 py-2 rounded-lg hover:bg-moss transition-colors disabled:opacity-50 w-full"
          >
            {loading ? "reading receipt..." : "upload & parse"}
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="bg-paper rounded-2xl p-8 w-full max-w-lg flex flex-col gap-4">
          <input
            type="text"
            placeholder="give this bill a name (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-body px-4 py-2 rounded-lg border border-moss/30 bg-cream"
            data-gramm="false"
          />

          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between font-mono text-sm">
                <span>{item.name} × {item.quantity}</span>
                <span>₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-moss/20 pt-2 mt-2 flex flex-col gap-1 font-mono text-sm">
              <div className="flex justify-between"><span>subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>tax</span><span>₹{tax.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-coral"><span>total</span><span>₹{total.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              translate="no"
              onClick={() => setSplitMode("EQUAL")}
              className={`font-body px-4 py-2 rounded-lg border ${splitMode === "EQUAL" ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
            >
              equal split
            </button>
            <button
              translate="no"
              onClick={() => setSplitMode("ITEMIZED")}
              className={`font-body px-4 py-2 rounded-lg border ${splitMode === "ITEMIZED" ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"}`}
            >
              itemized split
            </button>
          </div>

          {splitMode === "EQUAL" ? (
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
                {peopleCount > 0 ? `₹${(total / peopleCount).toFixed(2)} each` : "enter a number to see the split"}
              </p>
              {friends.length > 0 && (
                <>
                  <p className="font-body text-xs text-ink/50 mt-1">
                    optionally tag specific friends to track their balance:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {friends.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => toggleFriend(f.id)}
                        className={`font-body text-xs px-3 py-1 rounded-full border ${
                          selectedFriends.includes(f.id) ? "bg-leaf text-white border-leaf" : "border-moss/30 text-moss"
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="font-body text-xs text-ink/50">
              you'll tag which friend had what right after saving.
            </p>
          )}

          <button
            onClick={handleCreateBill}
            disabled={loading}
            className="font-body font-semibold bg-moss text-white py-2 rounded-lg hover:bg-moss/90 transition-colors disabled:opacity-50"
          >
            {loading ? "saving..." : "save & split"}
          </button>
        </div>
      )}
    </div>
  );
}