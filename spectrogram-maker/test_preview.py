#!/usr/bin/env python3
"""Test script for preview generation functionality"""

import sys
import os
from pathlib import Path
import requests
import time

# Configuration
BASE_URL = "http://0.0.0.0:8000"
TEST_AUDIO = "uploads/test_audio.wav"

def test_preview_generation():
    """Test 1: Generate preview"""
    print("\n" + "="*60)
    print("TEST 1: Preview Generation")
    print("="*60)

    if not os.path.exists(TEST_AUDIO):
        print(f"✗ Test audio not found: {TEST_AUDIO}")
        return False

    try:
        with open(TEST_AUDIO, 'rb') as f:
            files = {'file': f}
            params = {
                'colormap': 'magma',
                'scale': 'linear',
                'fft_size': '2048'
            }

            response = requests.post(f"{BASE_URL}/api/preview", files=files, params=params)
            print(f"Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                print(f"✓ Preview generated successfully")
                print(f"  - URL: {data.get('preview_url')}")
                print(f"  - Filename: {data.get('filename')}")
                print(f"  - Duration: {data.get('duration')} sec")
                print(f"  - Sample rate: {data.get('sample_rate')} Hz")

                # Test if file exists on disk
                output_dir = Path(__file__).parent / "outputs"
                preview_file = output_dir / data.get('filename')
                if preview_file.exists():
                    file_size = preview_file.stat().st_size
                    print(f"  - File size: {file_size} bytes")
                    print(f"✓ Preview file exists on disk")
                    return True
                else:
                    print(f"✗ Preview file not found on disk: {preview_file}")
                    return False
            else:
                print(f"✗ Error: {response.text}")
                return False

    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

def test_preview_with_different_scales():
    """Test 2: Preview with different FFT scales"""
    print("\n" + "="*60)
    print("TEST 2: Preview with Different FFT Scales")
    print("="*60)

    scales = ['linear', 'log', 'mel']
    results = {}

    for scale in scales:
        try:
            with open(TEST_AUDIO, 'rb') as f:
                files = {'file': f}
                params = {
                    'colormap': 'magma',
                    'scale': scale,
                    'fft_size': '2048'
                }

                response = requests.post(f"{BASE_URL}/api/preview", files=files, params=params)

                if response.status_code == 200:
                    print(f"✓ Scale '{scale}' - OK")
                    results[scale] = True
                else:
                    print(f"✗ Scale '{scale}' - Error: {response.status_code}")
                    results[scale] = False

        except Exception as e:
            print(f"✗ Scale '{scale}' - Exception: {e}")
            results[scale] = False

    return all(results.values())

def test_preview_with_different_fft_sizes():
    """Test 3: Preview with different FFT sizes"""
    print("\n" + "="*60)
    print("TEST 3: Preview with Different FFT Sizes")
    print("="*60)

    fft_sizes = ['256', '512', '1024', '2048', '4096']
    results = {}

    for fft_size in fft_sizes:
        try:
            with open(TEST_AUDIO, 'rb') as f:
                files = {'file': f}
                params = {
                    'colormap': 'magma',
                    'scale': 'linear',
                    'fft_size': fft_size
                }

                response = requests.post(f"{BASE_URL}/api/preview", files=files, params=params)

                if response.status_code == 200:
                    print(f"✓ FFT Size {fft_size} - OK")
                    results[fft_size] = True
                else:
                    print(f"✗ FFT Size {fft_size} - Error: {response.status_code}")
                    results[fft_size] = False

        except Exception as e:
            print(f"✗ FFT Size {fft_size} - Exception: {e}")
            results[fft_size] = False

    return all(results.values())

def test_preview_with_gray_colormap():
    """Test 4: Preview with Gray colormap"""
    print("\n" + "="*60)
    print("TEST 4: Preview with Gray Colormap")
    print("="*60)

    try:
        with open(TEST_AUDIO, 'rb') as f:
            files = {'file': f}
            params = {
                'colormap': 'gray',
                'scale': 'linear',
                'fft_size': '2048'
            }

            response = requests.post(f"{BASE_URL}/api/preview", files=files, params=params)

            if response.status_code == 200:
                print(f"✓ Gray colormap - OK")
                return True
            else:
                print(f"✗ Gray colormap - Error: {response.status_code}")
                print(f"  Response: {response.text}")
                return False

    except Exception as e:
        print(f"✗ Exception: {e}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("AUDIO SPECTROGRAM SERVICE - PREVIEW TESTS")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Test Audio: {TEST_AUDIO}")

    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/api/status", timeout=5)
        if response.status_code == 200:
            print("✓ Server is running")
        else:
            print("✗ Server returned error status")
            return
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to server. Make sure it's running on http://0.0.0.0:8000")
        print("\nTo start the server, run:")
        print("  uvicorn main:app --reload --host 0.0.0.0 --port 8000")
        return
    except Exception as e:
        print(f"✗ Error connecting to server: {e}")
        return

    # Run tests
    results = {
        "Preview Generation": test_preview_generation(),
        "Different FFT Scales": test_preview_with_different_scales(),
        "Different FFT Sizes": test_preview_with_different_fft_sizes(),
        "Gray Colormap": test_preview_with_gray_colormap()
    }

    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")

    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n✓ All tests passed!")
    else:
        print(f"\n✗ {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
