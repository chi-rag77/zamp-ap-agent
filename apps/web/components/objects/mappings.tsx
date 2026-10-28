'use client';

import { useEffect, useState } from 'react';
import { objectTypes, objectLabels, coreFields, type ObjectType } from '../../../../packages/objects/src/schema';
import { workspaceRequest } from './client';
import './workspace.css';

type Mapping = {
  id: string;
  integration_id: string;
  object_type: ObjectType;
  source_field: string;
  target_field: string;
  direction: 'INBOUND' | 'OUTBOUND';
  transformation: string;
  required: boolean;
};
type Integration = { id: string; name: string; status: string };
type MappingData = { mappings: Mapping[]; integrations: Integration[] };

export function IntegrationMappings() {
  const [data, setData] = useState<MappingData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [integration, setIntegration] = useState('');
  const [type, setType] = useState<ObjectType>('invoice');
  const [erpField, setErpField] = useState('');
  const [zampField, setZampField] = useState(coreFields.invoice[0]);
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [transform, setTransform] = useState('NONE');
  const [required, setRequired] = useState(false);
  const [sample, setSample] = useState('{}');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await workspaceRequest<MappingData>('mappings'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mappings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    workspaceRequest<{ role: string }>('members')
      .then((result) => setCanEdit(['OWNER', 'ADMIN'].includes(result.role)))
      .catch(() => setCanEdit(false));
  }, []);

  const changeObject = (next: ObjectType) => {
    setType(next);
    setZampField(coreFields[next][0]);
  };

  const save = async () => {
    if (!integration || !erpField.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await workspaceRequest('mappings', {
        integration_id: integration,
        object_type: type,
        source_field: direction === 'INBOUND' ? erpField.trim() : zampField,
        target_field: direction === 'INBOUND' ? zampField : erpField.trim(),
        direction,
        transformation: transform,
        required,
      });
      await load();
      setNotice('Field mapping saved.');
      setErpField('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mapping could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="object-workspace mapping-workspace">
      <header className="ow-heading">
        <div>
          <h2>Field mappings</h2>
          <p>Connect ERP fields to Zamp fields for each object and data direction.</p>
        </div>
        <span className="mapping-count">{data?.mappings.length ?? 0} mappings</span>
      </header>

      {error && <div className="ow-error" role="alert"><span>{error}</span><button className="button" onClick={() => void load()}>Retry</button></div>}
      {notice && <div className="mapping-notice" role="status">{notice}</div>}

      <section className="ow-card mapping-create">
        <div className="mapping-section-heading">
          <div><h3>Add a field mapping</h3><p>Choose where the data comes from and which Zamp field it should populate.</p></div>
          {!canEdit && <span className="mapping-readonly">Admin access required to edit</span>}
        </div>
        <fieldset disabled={!canEdit || busy}>
          <div className="mapping-form-grid">
            <label>Connected system
              <select value={integration} onChange={(e) => setIntegration(e.target.value)}>
                <option value="">Choose a connection</option>
                {data?.integrations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Zamp object
              <select value={type} onChange={(e) => changeObject(e.target.value as ObjectType)}>
                {objectTypes.map((item) => <option key={item} value={item}>{objectLabels[item]}</option>)}
              </select>
            </label>
            <label>Data direction
              <select value={direction} onChange={(e) => setDirection(e.target.value as 'INBOUND' | 'OUTBOUND')}>
                <option value="INBOUND">ERP → Zamp</option><option value="OUTBOUND">Zamp → ERP</option>
              </select>
            </label>
            <label>ERP field key
              <input value={erpField} onChange={(e) => setErpField(e.target.value)} placeholder="e.g. invoiceNumber" />
            </label>
            <label>Zamp field key
              <select value={zampField} onChange={(e) => setZampField(e.target.value)}>
                {coreFields[type].map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
            </label>
            <label>Transformation
              <select value={transform} onChange={(e) => setTransform(e.target.value)}>
                {['NONE', 'TRIM', 'UPPERCASE', 'LOWERCASE'].map((item) => <option key={item} value={item}>{item === 'NONE' ? 'No transformation' : item}</option>)}
              </select>
            </label>
          </div>
          <div className="mapping-form-footer">
            <label className="mapping-checkbox"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required field</label>
            <button className="button primary" disabled={!integration || !erpField.trim() || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save mapping'}</button>
          </div>
        </fieldset>
      </section>

      <section className="ow-card mapping-table-card">
        <div className="mapping-section-heading">
          <div><h3>Configured mappings</h3><p>All object mappings are listed together. Direction determines how the field pair is applied.</p></div>
        </div>
        <div className="ow-scroll">
          <table className="ow-table mapping-table">
            <thead><tr><th>Zamp object</th><th>Connected system</th><th>ERP field key</th><th>Zamp field key</th><th>Direction</th><th>Transform</th><th>Requirement</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="mapping-empty">Loading mappings…</td></tr>}
              {!loading && !data?.mappings.length && <tr><td colSpan={7} className="mapping-empty">No mappings configured yet. Add the first mapping above.</td></tr>}
              {data?.mappings.map((mapping) => {
                const inbound = mapping.direction === 'INBOUND';
                const system = data.integrations.find((item) => item.id === mapping.integration_id);
                return <tr key={mapping.id}>
                  <td><span className="mapping-object">{objectLabels[mapping.object_type]}</span><small className="mapping-object-key">{mapping.object_type}</small></td>
                  <td>{system?.name ?? 'Connection unavailable'}</td>
                  <td><code>{inbound ? mapping.source_field : mapping.target_field}</code></td>
                  <td><code>{inbound ? mapping.target_field : mapping.source_field}</code>{mapping.required && <span className="mapping-required" aria-label="Required">Required</span>}</td>
                  <td><span className={`mapping-direction ${inbound ? 'inbound' : 'outbound'}`}>{inbound ? 'ERP → Zamp' : 'Zamp → ERP'}</span></td>
                  <td>{mapping.transformation === 'NONE' ? 'None' : mapping.transformation}</td>
                  <td>{mapping.required ? 'Required' : 'Optional'}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <details className="ow-card mapping-preview">
        <summary><strong>Test a mapping</strong><span>Preview field conversion with sample JSON</span></summary>
        <div className="mapping-preview-body">
          <label>Sample JSON<textarea value={sample} onChange={(e) => setSample(e.target.value)} /></label>
          <button className="button" disabled={!canEdit || !integration} onClick={async () => {
            try {
              const result = await workspaceRequest('mapping-preview', { integrationId: integration, type, direction, sample: JSON.parse(sample) });
              setPreview(JSON.stringify(result, null, 2)); setError('');
            } catch (e) { setError(e instanceof Error ? e.message : 'Preview could not be generated.'); }
          }}>Preview mapping</button>
          {preview && <pre>{preview}</pre>}
        </div>
      </details>
    </div>
  );
}
