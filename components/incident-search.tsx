"use client";

import { useState } from "react";

type SearchResult = {
  incident_id: string | number;
  title: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  category_name: string;
  department_name: string;
  reported_by: string;
  similarity: number;
};

export default function IncidentSearch() {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function searchIncidents(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchTerm = query.trim();
    if (searchTerm.length < 2) {
      setError("Enter at least 2 characters to search incidents.");
      setResults(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/incidents/search?q=${encodeURIComponent(searchTerm)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Incident search failed.");
      }

      setResults(data.results);
      setSearchedQuery(searchTerm);
    } catch (searchError) {
      setResults(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Incident search failed."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setSearchedQuery("");
    setResults(null);
    setError("");
  }

  return (
    <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Find similar incidents with Qdrant</h2>
      <p className="mt-1 text-sm text-gray-600">
        Search in natural language. Qdrant ranks incidents by similarity across
        their title, description, and location. Only matches scoring 8% or higher
        are shown.
      </p>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void searchIncidents(event)}>
        <label className="sr-only" htmlFor="incident-similarity-query">
          Describe an incident to search
        </label>
        <input
          id="incident-similarity-query"
          type="search"
          minLength={2}
          maxLength={300}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. broken street lights near a bus stop"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search incidents"}
        </button>
        {results !== null && (
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-lg border px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {results !== null && (
        <div className="mt-5">
          <h3 className="font-medium">
            {results.length
              ? `${results.length} similar incident${results.length === 1 ? "" : "s"} for "${searchedQuery}"`
              : "No similar incidents found"}
          </h3>
          {results.length > 0 && (
            <ol className="mt-3 space-y-3">
              {results.map((incident) => (
                <li
                  key={incident.incident_id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        #{incident.incident_id} — {incident.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {incident.category_name} · {incident.department_name} ·{" "}
                        {incident.location}
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 capitalize">
                        {incident.status.replaceAll("_", " ")}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
                        Similarity {(incident.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{incident.description}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Reported by {incident.reported_by} · Priority: {incident.priority}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
