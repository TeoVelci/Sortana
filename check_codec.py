import cv2
cap = cv2.VideoCapture('latest_proxy.mp4')
fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
fourcc_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
print(f"FourCC: {fourcc_str}")
print(f"FPS: {cap.get(cv2.CAP_PROP_FPS)}")
print(f"Width: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}")
print(f"Height: {cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
