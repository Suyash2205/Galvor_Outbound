"use client";

import { useEffect, useState } from "react";

export function AddTrackerBrandModal({
  open,
  industryCategories,
  loading,
  error,
  onClose,
  onSubmit,
  onAddIndustryCategory,
}: {
  open: boolean;
  industryCategories: string[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: {
    brand: string;
    category: string;
    firstName: string;
    lastName: string;
    source: string;
    owner: string;
  }) => void;
  onAddIndustryCategory: (name: string) => Promise<void>;
}) {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [showNewIndustry, setShowNewIndustry] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBrand("");
    setCategory("");
    setFirstName("");
    setLastName("");
    setSource("");
    setOwner("");
    setNewIndustry("");
    setShowNewIndustry(false);
  }, [open]);

  if (!open) return null;

  const handleAddIndustry = async () => {
    if (!newIndustry.trim()) return;
    await onAddIndustryCategory(newIndustry.trim());
    setCategory(newIndustry.trim());
    setNewIndustry("");
    setShowNewIndustry(false);
  };

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal modal--import" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <div className="modal__eyebrow">Tracker</div>
            <div className="modal__title">Add new brand</div>
          </div>
          <button className="modal__close" onClick={onClose} disabled={loading} aria-label="Close">
            ×
          </button>
        </div>

        <p className="modal__import-hint">
          Creates a new row on the Tracker sheet — same columns as the spreadsheet.
        </p>

        <form
          className="outreach-form outreach-form--modal"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ brand, category, firstName, lastName, source, owner });
          }}
        >
          <label className="outreach-field outreach-field--full">
            <span>Company / Brand</span>
            <input
              className="lead-filters__input"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              required
              disabled={loading}
            />
          </label>

          <label className="outreach-field">
            <span>Category</span>
            <input
              className="lead-filters__input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="industry-categories"
              placeholder="Industry / category"
              disabled={loading}
            />
            <datalist id="industry-categories">
              {industryCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <div className="outreach-field">
            <span>&nbsp;</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowNewIndustry((v) => !v)}
              disabled={loading}
            >
              + New industry category
            </button>
          </div>

          {showNewIndustry && (
            <div className="outreach-field outreach-field--full outreach-inline-add">
              <input
                className="lead-filters__input"
                value={newIndustry}
                onChange={(e) => setNewIndustry(e.target.value)}
                placeholder="New industry category name"
                disabled={loading}
              />
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleAddIndustry}
                disabled={loading || !newIndustry.trim()}
              >
                Add
              </button>
            </div>
          )}

          <label className="outreach-field">
            <span>First name</span>
            <input
              className="lead-filters__input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="outreach-field">
            <span>Last name</span>
            <input
              className="lead-filters__input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="outreach-field">
            <span>Source</span>
            <input
              className="lead-filters__input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="outreach-field">
            <span>Owner</span>
            <input
              className="lead-filters__input"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={loading}
            />
          </label>

          {error && <p className="modal__error outreach-field--full">{error}</p>}

          <div className="modal__import-actions outreach-field--full">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading || !brand.trim()}>
              {loading ? "Adding…" : "Add to tracker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AddActivityCategoryModal({
  open,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div className="modal modal--import" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <div className="modal__eyebrow">Activity log</div>
            <div className="modal__title">Add new category</div>
          </div>
          <button className="modal__close" onClick={onClose} disabled={loading} aria-label="Close">
            ×
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(name.trim());
          }}
        >
          <label className="outreach-field outreach-field--full">
            <span>Category name</span>
            <input
              className="lead-filters__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Partnership"
              required
              disabled={loading}
            />
          </label>

          {error && <p className="modal__error">{error}</p>}

          <div className="modal__import-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={loading || !name.trim()}>
              {loading ? "Adding…" : "Add category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
