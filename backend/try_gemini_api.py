
import os
import django
import base64
from PIL import Image
import io
from dotenv import load_dotenv

load_dotenv()

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from segmenter.services.gemini import generate_candidates, MODEL_NAME

def create_dummy_image():
    # Create a 100x100 red image
    img = Image.new('RGB', (100, 100), color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def test_api_call():
    print(f"Testing API call to model: {MODEL_NAME}")
    image_bytes = create_dummy_image()
    try:
        candidates = generate_candidates(image_bytes)
        print("✅ API Call Successful!")
        print(f"Received {len(candidates)} candidates.")
        for i, cand in enumerate(candidates):
            print(f"  Candidate {i+1}: Label={cand.get('label')}, Confidence={cand.get('confidence')}")
    except Exception as e:
        print(f"❌ API Call Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if not os.getenv('GEMINI_API_KEY'):
        print("❌ GEMINI_API_KEY is not set.")
    else:
        test_api_call()
