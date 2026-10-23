import argparse
import json
import os
import sys
from pathlib import Path
import redis

CONSUMER_GROUP = "summary_embedding"
STREAM_KEY = "mira:stream:" + CONSUMER_GROUP
DEFAULT_OUTPUT_FILE = "redis_data.txt"
COUNT = 20

def get_redis_client():
    return redis.Redis(
        host="localhost",
        port=6379,
        db=0,
        decode_responses=True,
        protocol=2,
    )

def fetch_top_jobs(count: int = COUNT, parse_json: bool = True, latest: bool = True):
    r = get_redis_client()
    if not r.exists(STREAM_KEY):
        return []
    
    if latest:
        entries = r.xrevrange(STREAM_KEY, count=count)
        entries = list(reversed(entries))
    else:
        entries = r.xrange(STREAM_KEY, count=count)
    formatted_jobs = []
    
    for entry_id, fields in entries:
        if parse_json:
            job_data = {}
            for k, v in fields.items():
                try:
                    job_data[k] = json.loads(v)
                except Exception:
                    job_data[k] = v
        else:
            job_data = dict(fields)
        formatted_jobs.append((entry_id, job_data))
        
    return formatted_jobs

def build_formatted_text(jobs) -> str:
    lines = []
    delimiter = "--------------------------------------"
    
    for idx, (entry_id, job) in enumerate(jobs, 1):
        lines.append(delimiter)
        lines.append(f"{idx}:")
        job_json = json.dumps(job, indent=2, ensure_ascii=False)
        lines.append(job_json)
        
    if jobs:
        lines.append(delimiter)
    else:
        lines.append(delimiter)
        lines.append("No jobs found in stream mira:stream:ocr_summarization")
        lines.append(delimiter)
        
    return "\n".join(lines) + "\n"

def main():
    parser = argparse.ArgumentParser(description="Export top jobs from ocr_summarization stream")
    parser.add_argument("--count", type=int, default=COUNT)
    parser.add_argument("--output", type=str, default=DEFAULT_OUTPUT_FILE)
    parser.add_argument("--raw", action="store_true")
    parser.add_argument("--oldest", action="store_true")
    args = parser.parse_args()

    jobs = fetch_top_jobs(count=args.count, parse_json=not args.raw, latest=not args.oldest)
    content = build_formatted_text(jobs)
    
    output_path = Path(args.output).resolve()
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Successfully exported {len(jobs)} job(s) from '{STREAM_KEY}' to '{output_path.name}'.")

if __name__ == "__main__":
    main()
