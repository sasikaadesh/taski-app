#!/usr/bin/env python3
"""
rag.py — Taski RAG (Retrieval-Augmented Generation) backend.
Install deps once: pip install anthropic chromadb pypdf
"""

import sys
import json
import os
import argparse
from pathlib import Path


# ── Storage ───────────────────────────────────────────────────────────────────

def get_storage_dir():
    storage = Path.home() / '.taski' / 'rag'
    storage.mkdir(parents=True, exist_ok=True)
    return storage


# ── Text extraction ───────────────────────────────────────────────────────────

def read_pdf(file_path):
    try:
        import pypdf
        reader = pypdf.PdfReader(file_path)
        text = ''
        for page in reader.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + '\n'
        return text, None
    except ImportError:
        return None, 'pypdf not installed. Run: pip install pypdf'
    except Exception as e:
        return None, str(e)


def read_text(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read(), None
    except Exception as e:
        return None, str(e)


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_text(text, chunk_size=1000, overlap=150):
    chunks = []
    start = 0
    text = text.strip()
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(text):
            break
        start += chunk_size - overlap
    return chunks


# ── ChromaDB collection ───────────────────────────────────────────────────────

def get_collection():
    try:
        import chromadb
        storage_dir = get_storage_dir()
        client = chromadb.PersistentClient(path=str(storage_dir / 'chroma'))
        collection = client.get_or_create_collection(
            name='taski_docs',
            metadata={'hnsw:space': 'cosine'},
        )
        return collection, None
    except ImportError:
        return None, 'chromadb not installed. Run: pip install chromadb'
    except Exception as e:
        return None, str(e)


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_ingest(file_paths):
    collection, err = get_collection()
    if err:
        print(json.dumps({'error': err}), flush=True)
        return

    total_chunks = 0
    warnings = []

    for raw_path in file_paths:
        file_path = raw_path.strip()
        if not os.path.exists(file_path):
            warnings.append(f'{file_path}: file not found')
            continue

        ext = Path(file_path).suffix.lower()
        file_name = Path(file_path).name

        print(json.dumps({'progress': f'Reading {file_name}...'}), flush=True)

        if ext == '.pdf':
            text, err = read_pdf(file_path)
        elif ext in ('.txt', '.md'):
            text, err = read_text(file_path)
        else:
            warnings.append(f'{file_name}: unsupported type (use .pdf .txt .md)')
            continue

        if err:
            warnings.append(f'{file_name}: {err}')
            continue
        if not text or not text.strip():
            warnings.append(f'{file_name}: no text could be extracted')
            continue

        print(json.dumps({'progress': f'Chunking {file_name}...'}), flush=True)
        chunks = chunk_text(text)

        # Remove any previously ingested version of this file
        try:
            existing = collection.get(where={'source': file_name})
            if existing['ids']:
                collection.delete(ids=existing['ids'])
        except Exception:
            pass

        print(json.dumps({'progress': f'Indexing {len(chunks)} chunks from {file_name}...'}), flush=True)

        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            ids = [f'{file_name}__chunk_{i + j}' for j in range(len(batch))]
            metas = [{'source': file_name, 'chunk_index': i + j} for j in range(len(batch))]
            collection.add(documents=batch, ids=ids, metadatas=metas)

        total_chunks += len(chunks)
        print(json.dumps({'progress': f'Done: {file_name} ({len(chunks)} chunks)'}), flush=True)

    result = {'chunks_added': total_chunks}
    if warnings:
        result['warnings'] = warnings
    print(json.dumps(result), flush=True)


def cmd_ask(question):
    api_key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        print(json.dumps({'error': 'ANTHROPIC_API_KEY not set in environment'}), flush=True)
        return

    collection, err = get_collection()
    if err:
        print(json.dumps({'error': err}), flush=True)
        return

    try:
        count = collection.count()
        if count == 0:
            print(json.dumps({'answer': 'The knowledge base is empty. Upload a document first.', 'sources': []}), flush=True)
            return

        results = collection.query(
            query_texts=[question],
            n_results=min(5, count),
        )

        chunks = results['documents'][0] if results['documents'] else []
        sources = list({m['source'] for m in results['metadatas'][0]}) if results['metadatas'] else []

        if not chunks:
            print(json.dumps({'answer': 'No relevant content found.', 'sources': []}), flush=True)
            return

        context = '\n\n---\n\n'.join(chunks)

        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=1024,
            messages=[{
                'role': 'user',
                'content': (
                    f'Use the following document excerpts to answer the question accurately.\n\n'
                    f'Document context:\n{context}\n\n'
                    f'Question: {question}'
                ),
            }],
        )
        answer = message.content[0].text
        print(json.dumps({'answer': answer, 'sources': sources}), flush=True)

    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)


def cmd_status():
    try:
        collection, err = get_collection()
        if err:
            print(json.dumps({'status': 'error', 'error': err}), flush=True)
            return
        print(json.dumps({'status': 'ready', 'total_chunks': collection.count()}), flush=True)
    except Exception as e:
        print(json.dumps({'status': 'error', 'error': str(e)}), flush=True)


def cmd_list():
    try:
        collection, err = get_collection()
        if err:
            print(json.dumps({'error': err}), flush=True)
            return

        if collection.count() == 0:
            print(json.dumps({'documents': []}), flush=True)
            return

        all_items = collection.get()
        sources = {}
        for meta in all_items['metadatas']:
            name = meta['source']
            sources[name] = sources.get(name, 0) + 1

        docs = [{'name': n, 'chunks': c} for n, c in sources.items()]
        print(json.dumps({'documents': docs}), flush=True)

    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)


def cmd_delete(filename):
    try:
        collection, err = get_collection()
        if err:
            print(json.dumps({'error': err}), flush=True)
            return

        existing = collection.get(where={'source': filename})
        if not existing['ids']:
            print(json.dumps({'error': f'{filename} not found in knowledge base'}), flush=True)
            return

        collection.delete(ids=existing['ids'])
        print(json.dumps({'success': True, 'deleted': filename}), flush=True)

    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Taski RAG backend')
    parser.add_argument('--ingest', action='store_true')
    parser.add_argument('--files',  type=str, help='Comma-separated file paths')
    parser.add_argument('--ask',    type=str, help='Question to answer')
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--list',   action='store_true')
    parser.add_argument('--delete', type=str, help='Document name to delete')
    args = parser.parse_args()

    if args.ingest:
        if not args.files:
            print(json.dumps({'error': '--files is required with --ingest'}), flush=True)
            return
        cmd_ingest([f.strip() for f in args.files.split(',') if f.strip()])
    elif args.ask:
        cmd_ask(args.ask)
    elif args.status:
        cmd_status()
    elif args.list:
        cmd_list()
    elif args.delete:
        cmd_delete(args.delete)
    else:
        print(json.dumps({'error': 'No command given. Use --ingest, --ask, --status, --list, or --delete'}), flush=True)


if __name__ == '__main__':
    main()
