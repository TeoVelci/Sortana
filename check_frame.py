import cv2
import numpy as np

cap = cv2.VideoCapture('latest_proxy.mp4')
ret, frame = cap.read()
if not ret:
    print("Failed to read frame")
    exit(1)

# Check if frame is all white
mean_val = np.mean(frame)
print(f"Mean pixel value: {mean_val}")
if mean_val > 250:
    print("Frame is almost entirely white!")
else:
    print("Frame is NOT white!")
