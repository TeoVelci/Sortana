import cv2
cap = cv2.VideoCapture('latest_proxy.mp4')
ret, frame = cap.read()
if ret:
    cv2.imwrite('/Users/matteovelci/.gemini/antigravity/brain/c1ec2ed4-e813-4e6e-a3ac-6817b02750ef/first_frame.jpg', frame)
    print("Saved first_frame.jpg")
