import cv2
import numpy as np

cap = cv2.VideoCapture('latest_proxy.mp4')
ret, frame = cap.read()
if ret:
    print(f"Min: {np.min(frame)}, Max: {np.max(frame)}, Mean: {np.mean(frame)}")
    
    # Let's also check the middle 100x100 block
    h, w = frame.shape[:2]
    mid = frame[h//2-50:h//2+50, w//2-50:w//2+50]
    print(f"Mid block Mean: {np.mean(mid)}")
    
    # Are all pixels exactly 255?
    num_white = np.sum(frame == 255)
    total = frame.size
    print(f"White pixels: {num_white} out of {total} ({(num_white/total)*100:.2f}%)")
