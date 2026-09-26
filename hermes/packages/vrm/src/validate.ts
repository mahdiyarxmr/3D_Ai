/**
 * VRM validation.
 *
 * docs/FILE_FORMATS.md: uploaded assets are untrusted data. We therefore
 * validate the container *before* handing bytes to the glTF parser, and we
 * never evaluate anything from the file.
 */

export const VRM_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export type VrmValidationError =
  | 'too_small'
  | 'too_large'
  | 'not_glb'
  | 'unsupported_version'
  | 'length_mismatch'
  | 'no_json_chunk'
  | 'bad_json'
  | 'not_vrm';

export interface VrmValidationResult {
  ok: boolean;
  error?: VrmValidationError;
  /** "0.x" or "1.0" when detectable. */
  specVersion?: string;
  meta?: { name?: string; author?: string; license?: string };
}

export function validateVrm(buffer: ArrayBuffer): VrmValidationResult {
  if (buffer.byteLength < 20) return { ok: false, error: 'too_small' };
  if (buffer.byteLength > VRM_MAX_BYTES) return { ok: false, error: 'too_large' };

  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) return { ok: false, error: 'not_glb' };

  const version = view.getUint32(4, true);
  if (version !== 2) return { ok: false, error: 'unsupported_version' };

  const declaredLength = view.getUint32(8, true);
  if (declaredLength > buffer.byteLength) return { ok: false, error: 'length_mismatch' };

  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== CHUNK_JSON) return { ok: false, error: 'no_json_chunk' };
  if (20 + chunkLength > buffer.byteLength) return { ok: false, error: 'length_mismatch' };

  let gltf: {
    extensions?: Record<string, unknown>;
    extensionsUsed?: string[];
  };
  try {
    // The spec pads the JSON chunk to a 4-byte boundary with spaces; some
    // exporters use NULs instead. Strip both before parsing.
    const json = new TextDecoder()
      .decode(new Uint8Array(buffer, 20, chunkLength))
      .replace(/[\s\0]+$/, '');
    gltf = JSON.parse(json) as typeof gltf;
  } catch {
    return { ok: false, error: 'bad_json' };
  }

  const ext = gltf.extensions ?? {};
  const used = gltf.extensionsUsed ?? [];
  const hasVrm1 = 'VRMC_vrm' in ext || used.includes('VRMC_vrm');
  const hasVrm0 = 'VRM' in ext || used.includes('VRM');
  if (!hasVrm0 && !hasVrm1) return { ok: false, error: 'not_vrm' };

  const meta: VrmValidationResult['meta'] = {};
  if (hasVrm1) {
    const vrm = ext['VRMC_vrm'] as { meta?: { name?: string; authors?: string[]; licenseUrl?: string } } | undefined;
    meta.name = vrm?.meta?.name;
    meta.author = vrm?.meta?.authors?.join(', ');
    meta.license = vrm?.meta?.licenseUrl;
  } else {
    const vrm = ext['VRM'] as { meta?: { title?: string; author?: string; licenseName?: string } } | undefined;
    meta.name = vrm?.meta?.title;
    meta.author = vrm?.meta?.author;
    meta.license = vrm?.meta?.licenseName;
  }

  return { ok: true, specVersion: hasVrm1 ? '1.0' : '0.x', meta };
}
