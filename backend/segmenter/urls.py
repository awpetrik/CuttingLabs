from django.urls import path
from segmenter import views

urlpatterns = [
    path('upload', views.UploadView.as_view(), name='upload'),
    path('segment', views.SegmentView.as_view(), name='segment'),
    path('job/<uuid:job_id>', views.JobView.as_view(), name='job'),
    path('download/<uuid:job_id>', views.DownloadView.as_view(), name='download'),
    path('download_zip', views.DownloadZipView.as_view(), name='download_zip'),
]
