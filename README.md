# CuttingLabs ✂️

<p>
  <img width="1600" height="953" alt="image" src="https://github.com/user-attachments/assets/fdde9e18-599e-4021-b96f-759d054fcf14" />
</p>

**CuttingLabs** is a high-performance image segmentation application that leverages a hybrid AI approach, utilizing Google Gemini API for cloud-based precision and RMBG-2.0 for fast, local background removal. Built with Next.js and Django, it features a professional comparison UI with perfect 1:1 alignment, real-time edge refinement, and intelligent hardware-accelerated fallback to ensure a seamless and efficient cutout workflow.

## Key Features
- **Hybrid AI Segmentation**: Seamlessly switch between Gemini (Cloud) and RMBG-2.0 (Local).
- **Pro Comparison Slider**: Precision 1:1 alignment for accurate before/after viewing.
- **Hardware Acceleration**: Automatic detection of CUDA, MPS, or CPU for local processing.
- **Edge Refinement**: Granular control over Threshold, Feather, and Padding.
- **Fast Fallback**: Intelligent automatic switching to local model based on API quota or timeout.

## Tech Stack
- **Frontend**: Next.js 14, Tailwind CSS, Lucide Icons.
- **Backend**: Django, Django REST Framework, Celery, Redis.
- **AI Models**: Google Gemini Pro Vision, RMBG-2.0 (ONNX).
- **Processing**: Pillow, NumPy, ONNX Runtime.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker (optional)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/awpetrik/CuttingLabs.git
   ```
2. Setup Backend:
   - Create `.env` from `.env.example` and add your `GEMINI_API_KEY`.
   - Install dependencies: `pip install -r requirements.txt`.
   - Run: `python manage.py runserver`.
3. Setup Frontend:
   - Install dependencies: `npm install`.
   - Run: `npm run dev`.

## License
MIT
