
import os
import django
from django.conf import settings

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from segmenter.services.gemini import _client_new_sdk, _generate_with_legacy_sdk, MODEL_NAME

def test_imports():
    print("Testing imports...")
    try:
        import google.genai
        print("✅ google.genai imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import google.genai: {e}")

    try:
        import google.generativeai
        print("✅ google.generativeai imported successfully")
    except ImportError as e:
        print(f"❌ Failed to import google.generativeai: {e}")

def test_api_key():
    print("\nTesting API Key...")
    api_key = os.getenv('GEMINI_API_KEY')
    if api_key:
        print(f"✅ GEMINI_API_KEY found: {api_key[:5]}...")
    else:
        print("❌ GEMINI_API_KEY not found in environment!")

if __name__ == "__main__":
    test_imports()
    test_api_key()
    print(f"\nModel Name: {MODEL_NAME}")
