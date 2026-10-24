from __future__ import annotations
import argparse
import sys
from pathlib import Path
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))
from .caller import call_llm, AI_UNAVAILABLE_MESSAGE
from .response_parser import parse_response
from .error_analysis import classify_error, ErrorType
__all__ = ['call_llm', 'AI_UNAVAILABLE_MESSAGE', 'parse_response', 'classify_error', 'ErrorType']

def main():
    parser = argparse.ArgumentParser(description='MIRA Engine LLM CLI Caller')
    parser.add_argument('prompt', type=str, help='Prompt string to execute')
    parser.add_argument('--work', type=str, default='summarization', help='Work type (default: summarization)')
    args = parser.parse_args()
    response = call_llm(prompt=args.prompt, work=args.work)
    print('\n--- LLM Response ---')
    print(response)
    print('--------------------\n')
if __name__ == '__main__':
    main()
