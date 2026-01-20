# Drug Repurposing with BindingDB and 24Agents

This folder contains a full, end-to-end Jupyter notebook demonstrating a realistic drug repurposing workflow using datasets hosted on the 24Agents platform.

## Contents

- `drug_repurposing_pipeline.ipynb`
  - Pyodide-compatible (browser runnable)
  - Uses the 24Agents Hypha RPC API
  - Integrates BindingDB with Broad Institute repurposing metadata

## Requirements

- Python 3.11
- A valid `BIOIMAGEIO_API_TOKEN` available via `.env` or environment variable

No compiled dependencies are required; all packages are installed via `micropip` when running in Pyodide.
