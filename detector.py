# detector.py - Enhanced version with duplicate prevention and image saving e5-pro

import cv2
import numpy as np
from collections import deque, Counter
import time
import os
from datetime import datetime
from openpyxl import Workbook, load_workbook
import config

class ConnectorDetector:
    """Modified connector detector with manual capture on spacebar"""
    
    def __init__(self):
        # Detection parameters
        # EXPECTED_ORDER is read TOP to BOTTOM along the Y axis of the ROI.
        # The production camera is mounted rotated 90° relative to the
        # operator's view: what the operator calls the "left wire" appears at
        # the top of the camera image, and the "right wire" at the bottom.
        # So the operator's spec "yellow-left, green-right == OK (good wiring)"
        # becomes "yellow on top, green on bottom == OK" in the image frame.
        self.EXPECTED_ORDER = ["yellow", "green"]
        self.DARK_THRESH = 60
        self.MIN_CONNECTOR_AREA = 4000
        self.CONNECTOR_EXPAND = 12
        self.MIN_COLOR_AREA = 120
        self.STABILITY_FRAMES = 5

        # HSV color ranges tuned via calibrate_colors.py against good_*/bad_*.jpg.
        self.COLOR_RANGES = {
            "green":  ((39, 67, 101), (86, 254, 234)),
            "yellow": ((20, 127, 133), (32, 255, 255)),
        }
        
        # State variables
        self.ok_count = 0
        self.not_ok_count = 0
        self.running = False
        self.cap = None
        self.roi_box = None
        self.ZOOM_LEVEL = 2
        self.use_center_roi = True
        
        # NEW: Daily count tracking
        self.daily_count = 0
        self.current_date = datetime.now().date()
        self._load_daily_count()
        
        # New state variables for manual capture mode
        self.wire_detected = False
        self.evaluating = False
        self.last_result = None
        self.captured_frame = None
        
        # NEW: Track if current wire has been tested
        self.current_wire_tested = False
        self.wire_was_present = False
        self.eval_window_open = False
        self.wire_ready_for_test = False  # NEW: Track if wire is properly detectable
        
        # NEW: Create folder for saving images
        self.images_folder = "detection_results"
        os.makedirs(self.images_folder, exist_ok=True)
        
        # NEW: Daily count tracking file
        self.daily_count_file = "daily_count.txt"
        
        # Probe whether OpenCV highgui is available
        try:
            cv2.namedWindow("__probe__", cv2.WINDOW_NORMAL)
            cv2.destroyWindow("__probe__")
            self.gui_available = True
        except Exception:
            self.gui_available = False
            print("OpenCV GUI not available – running in headless mode.")

        self.latest_jpg = None
        
        # Initialize logger
        self._init_excel_log()
    
    def _init_excel_log(self):
        """Initialize Excel log file"""
        if not os.path.exists(config.EXCEL_LOG):
            try:
                wb = Workbook()
                ws = wb.active
                ws.append(["datetime", "total", "ok", "not_ok", "image_path", "daily_count"])
                wb.save(config.EXCEL_LOG)
            except Exception as e:
                print(f"Failed to create Excel log: {e}")
    
    def _load_daily_count(self):
        """Load daily count from file, reset if new day"""
        try:
            if os.path.exists(self.daily_count_file):
                with open(self.daily_count_file, 'r') as f:
                    lines = f.readlines()
                    if len(lines) >= 2:
                        saved_date = datetime.strptime(lines[0].strip(), "%Y-%m-%d").date()
                        saved_count = int(lines[1].strip())
                        
                        # Check if it's a new day
                        if saved_date == self.current_date:
                            self.daily_count = saved_count
                            print(f"Loaded daily count: {self.daily_count} for {self.current_date}")
                        else:
                            # New day - reset count
                            self.daily_count = 0
                            self._save_daily_count()
                            print(f"New day detected. Daily count reset to 0 for {self.current_date}")
                    else:
                        self.daily_count = 0
                        self._save_daily_count()
            else:
                self.daily_count = 0
                self._save_daily_count()
                print(f"Starting new daily count for {self.current_date}")
        except Exception as e:
            print(f"Failed to load daily count: {e}")
            self.daily_count = 0
    
    def _save_daily_count(self):
        """Save current daily count to file"""
        try:
            with open(self.daily_count_file, 'w') as f:
                f.write(f"{self.current_date.strftime('%Y-%m-%d')}\n")
                f.write(f"{self.daily_count}\n")
        except Exception as e:
            print(f"Failed to save daily count: {e}")
    
    def _check_and_reset_daily_count(self):
        """Check if date has changed and reset count if needed"""
        current = datetime.now().date()
        if current != self.current_date:
            # New day detected during runtime
            self.current_date = current
            self.daily_count = 0
            self._save_daily_count()
            print(f"Day changed! Daily count reset to 0 for {self.current_date}")
    
    def _append_log(self, image_path=""):
        """Append current counts to Excel log"""
        try:
            total = self.ok_count + self.not_ok_count
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            wb = load_workbook(config.EXCEL_LOG)
            ws = wb.active
            ws.append([now, total, self.ok_count, self.not_ok_count, image_path, self.daily_count])
            wb.save(config.EXCEL_LOG)
        except Exception as e:
            print(f"Failed to log results: {e}")
    
    def _save_detection_image(self, frame, result):
        """Save the detection image with result overlay"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"{result}_{timestamp}.jpg"
            filepath = os.path.join(self.images_folder, filename)
            
            # Create a copy for saving
            save_frame = frame.copy()
            
            # Add result text overlay
            result_color = (0, 255, 0) if result == "OK" else (0, 0, 255)
            cv2.putText(save_frame, f"Result: {result}", (10, 50),
                       cv2.FONT_HERSHEY_SIMPLEX, 1.2, result_color, 3)
            
            # NEW: Add daily count overlay (top-left, below result)
            cv2.putText(save_frame, f"Daily Count: {self.daily_count}", (10, 100),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
            
            # Add timestamp
            cv2.putText(save_frame, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), 
                       (10, save_frame.shape[0] - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Save the image
            cv2.imwrite(filepath, save_frame)
            print(f"Image saved: {filepath}")
            return filepath
        except Exception as e:
            print(f"Failed to save image: {e}")
            return ""
    
    def auto_detect_connector(self, frame):
        """Detect dark rectangular connector housing"""
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, th = cv2.threshold(blur, self.DARK_THRESH, 255, cv2.THRESH_BINARY_INV)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        clean = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < self.MIN_CONNECTOR_AREA:
                continue
            x, y, ww, hh = cv2.boundingRect(cnt)
            candidates.append((area, x, y, ww, hh))
        
        if not candidates:
            return None
        
        candidates.sort(reverse=True, key=lambda t: t[0])
        _, x, y, ww, hh = candidates[0]
        
        # Expand ROI
        x1 = max(0, x - self.CONNECTOR_EXPAND)
        y1 = max(0, y - self.CONNECTOR_EXPAND)
        x2 = min(w, x + ww + self.CONNECTOR_EXPAND)
        y2 = min(h, y + hh + self.CONNECTOR_EXPAND)
        
        return (x1, y1, x2 - x1, y2 - y1)
    
    def check_wire_presence(self, frame, roi):
        """Check if wires are present in the ROI"""
        x, y, rw, rh = roi
        roi_img = frame[y:y+rh, x:x+rw]
        hsv = cv2.cvtColor(roi_img, cv2.COLOR_BGR2HSV)
        
        wire_found = False
        
        for color_name, (lower, upper) in self.COLOR_RANGES.items():
            lower = np.array(lower, dtype=np.uint8)
            upper = np.array(upper, dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                largest = max(contours, key=cv2.contourArea)
                area = cv2.contourArea(largest)
                if area >= self.MIN_COLOR_AREA:
                    wire_found = True
                    break
        
        return wire_found
    
    def is_wire_properly_detectable(self, frame, roi):
        """Check if wire is properly positioned and detectable for evaluation"""
        x, y, rw, rh = roi
        roi_img = frame[y:y+rh, x:x+rw]
        hsv = cv2.cvtColor(roi_img, cv2.COLOR_BGR2HSV)
        
        detected_colors = []
        
        for color_name, (lower, upper) in self.COLOR_RANGES.items():
            lower = np.array(lower, dtype=np.uint8)
            upper = np.array(upper, dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            
            if area >= self.MIN_COLOR_AREA:
                M = cv2.moments(largest)
                if M["m00"] != 0:
                    detected_colors.append(color_name)
        
        # Wire is properly detectable if we can detect the expected number of colors
        return len(detected_colors) == len(self.EXPECTED_ORDER)
    
    def detect_colors_in_roi(self, frame, roi):
        """Detect wire colors in ROI and mark them"""
        x, y, rw, rh = roi
        roi_img = frame[y:y+rh, x:x+rw]
        hsv = cv2.cvtColor(roi_img, cv2.COLOR_BGR2HSV)
        
        detected = []
        
        for color_name, (lower, upper) in self.COLOR_RANGES.items():
            lower = np.array(lower, dtype=np.uint8)
            upper = np.array(upper, dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            
            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            
            if area < self.MIN_COLOR_AREA:
                continue
            
            M = cv2.moments(largest)
            if M["m00"] == 0:
                continue
            
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            
            cv2.circle(frame, (x + cx, y + cy), 4, (255, 255, 255), -1)
            cv2.putText(frame, color_name, (x + cx + 6, y + cy - 6),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

            # Sort by y-centroid so the returned list is ordered TOP -> BOTTOM.
            # In the production camera view the connector is rotated 90°, so
            # the operator's "left wire" appears at the top of the image and
            # "right wire" at the bottom.
            detected.append((cy, color_name))

        detected.sort(key=lambda t: t[0])
        return [name for _, name in detected]
    
    def evaluate_captured_frame(self):
        """Evaluate the captured frame and update counts"""
        if self.captured_frame is None or self.roi_box is None:
            return None
        
        # NEW: Check if date has changed
        self._check_and_reset_daily_count()
        
        detected_order = self.detect_colors_in_roi(self.captured_frame.copy(), self.roi_box)
        
        if len(detected_order) != len(self.EXPECTED_ORDER):
            return "NOT DETECTED"

        # Direct match on top-to-bottom order. With the camera rotated 90°,
        # image-top == operator's left and image-bottom == operator's right:
        #   yellow on top, green on bottom (= yellow-left, green-right)  -> OK
        #   green on top,  yellow on bottom (= green-left, yellow-right) -> NOT OK
        status = "OK" if detected_order == self.EXPECTED_ORDER else "NOT OK"
        
        # Update counts
        if status == "OK":
            self.ok_count += 1
        else:
            self.not_ok_count += 1
        
        # NEW: Increment daily count
        self.daily_count += 1
        self._save_daily_count()
        
        return status
    
    def run(self):
        """Main detection loop with manual capture"""
        self.running = True
        self.cap = cv2.VideoCapture(1)
        
        if not self.cap.isOpened():
            print("Cannot open camera")
            self.running = False
            return
        
        print("Detection started.")
        print("Press SPACEBAR to capture and evaluate")
        print("Press 'q' to quit")
        print("Press 'r' to manually select ROI")
        print("Press 'c' to reset to center ROI")
        print("Press '+/-' to zoom in/out")
        
        while self.running:
            # NEW: Check if date has changed (for long-running sessions)
            self._check_and_reset_daily_count()
            
            ret, frame = self.cap.read()
            if not ret:
                print("Camera read failed")
                break
            
            h, w = frame.shape[:2]
            
            # Zoom handling
            if self.ZOOM_LEVEL > 1:
                center_x, center_y = w // 2, h // 2
                new_w, new_h = w // self.ZOOM_LEVEL, h // self.ZOOM_LEVEL
                x1 = max(center_x - new_w // 2, 0)
                y1 = max(center_y - new_h // 2, 0)
                x2 = min(center_x + new_w // 2, w)
                y2 = min(center_y + new_h // 2, h)
                frame = frame[y1:y2, x1:x2]
                frame = cv2.resize(frame, (w, h))
            
            display = frame.copy()
            
            # Center alignment box
            box_w, box_h = w // 3, h // 4
            box_x, box_y = w//2 - box_w//2, h//2 - box_h//2
            cv2.rectangle(display, (box_x, box_y), (box_x+box_w, box_y+box_h), (255, 0, 0), 2)
            
            center_roi = (box_x, box_y, box_w, box_h)
            
            if self.use_center_roi:
                self.roi_box = center_roi
            else:
                if self.roi_box is None:
                    auto_roi = self.auto_detect_connector(frame)
                    if auto_roi is not None:
                        self.roi_box = auto_roi
            
            # Check for wire presence
            if self.roi_box is not None:
                x, y, rw, rh = self.roi_box
                cv2.rectangle(display, (x, y), (x + rw, y + rh), (0, 255, 0), 2)
                
                self.wire_detected = self.check_wire_presence(frame, self.roi_box)
                
                # NEW: Check if wire is properly detectable (all expected colors visible)
                self.wire_ready_for_test = self.is_wire_properly_detectable(frame, self.roi_box)
                
                # NEW: Track wire removal to reset tested state
                if self.wire_was_present and not self.wire_detected:
                    # Wire was removed - reset the tested flag
                    self.current_wire_tested = False
                    self.eval_window_open = False
                    self.last_result = None  # NEW: Clear last result on wire removal
                    # Close evaluation window if open
                    try:
                        cv2.destroyWindow("Evaluation Result")
                    except:
                        pass
                    print("Wire removed - ready for next test")
                
                self.wire_was_present = self.wire_detected
                
                # Display status in top right corner
                if self.current_wire_tested and self.last_result not in ["NOT DETECTED", None]:
                    # Wire has been successfully tested (OK or NOT OK)
                    status_text = "WIRE TESTED"
                    status_color = (0, 165, 255)  # Orange color
                elif self.last_result == "NOT DETECTED":
                    # Allow re-testing when NOT DETECTED
                    status_text = "ADJUST WIRE"
                    status_color = (0, 165, 255)  # Orange color
                elif self.wire_ready_for_test:
                    status_text = "READY"
                    status_color = (0, 255, 0)
                elif self.wire_detected:
                    # Wire detected but not all colors are visible
                    status_text = "POSITION WIRE"
                    status_color = (0, 255, 255)  # Yellow color
                else:
                    status_text = "NO WIRE DETECTED"
                    status_color = (0, 0, 255)
                
                # Get text size for background
                text_size = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                text_x = w - text_size[0] - 20
                text_y = 40
                
                # Draw background rectangle
                cv2.rectangle(display, (text_x - 10, text_y - text_size[1] - 10),
                            (text_x + text_size[0] + 10, text_y + 10),
                            (0, 0, 0), -1)
                
                cv2.putText(display, status_text, (text_x, text_y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, status_color, 2)
            
            # NEW: Display daily count on camera screen (top-left corner)
            daily_count_text = f"Today: {self.daily_count}"
            daily_count_size = cv2.getTextSize(daily_count_text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
            
            # Draw background rectangle for daily count
            cv2.rectangle(display, (10, 10), (20 + daily_count_size[0], 50), (0, 0, 0), -1)
            cv2.putText(display, daily_count_text, (15, 40),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            
            # Display counts (optional - can be uncommented)
            # cv2.putText(display, f"OK: {self.ok_count} | NOT OK: {self.not_ok_count}", 
            #            (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            cv2.imshow("Connector Detection", display)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord(' '):  # Spacebar pressed
                # NEW: Check if wire has been successfully tested (OK or NOT OK, but not NOT DETECTED)
                wire_successfully_tested = (self.current_wire_tested and 
                                           self.last_result not in ["NOT DETECTED", None])
                
                if wire_successfully_tested:
                    # Wire already tested successfully - show message
                    print("Wire already tested! Please remove wire to test another.")
                elif not self.wire_ready_for_test:
                    # Wire not properly positioned or detectable
                    if self.wire_detected:
                        print("Cannot capture: Wire not properly positioned. Please adjust wire position.")
                    else:
                        print("Cannot capture: No wire detected")
                elif self.roi_box is not None:
                    # Wire is ready for testing or needs re-testing after NOT DETECTED
                    # Capture the current frame
                    self.captured_frame = frame.copy()
                    
                    # Create a copy for evaluation display
                    eval_display = self.captured_frame.copy()
                    
                    # Evaluate
                    result = self.evaluate_captured_frame()
                    self.last_result = result
                    
                    # Only mark as tested if result is OK or NOT OK (not NOT DETECTED)
                    if result in ["OK", "NOT OK"]:
                        self.current_wire_tested = True
                    else:
                        # NOT DETECTED - allow re-testing
                        self.current_wire_tested = False
                        print(f"Result: {result} - Please adjust wire and press SPACEBAR again")
                    
                    # Show the captured frame with detection
                    if result:
                        x, y, rw, rh = self.roi_box
                        cv2.rectangle(eval_display, (x, y), (x + rw, y + rh), (0, 255, 0), 2)
                        self.detect_colors_in_roi(eval_display, self.roi_box)
                        
                        if result == "NOT DETECTED":
                            result_color = (0, 165, 255)  # Orange for NOT DETECTED
                        else:
                            result_color = (0, 255, 0) if result == "OK" else (0, 0, 255)
                        
                        cv2.putText(eval_display, f"Result: {result}", (10, 50),
                                   cv2.FONT_HERSHEY_SIMPLEX, 1.2, result_color, 3)
                        
                        # NEW: Only save image and log if result is OK or NOT OK
                        if result in ["OK", "NOT OK"]:
                            # Save the image
                            image_path = self._save_detection_image(eval_display, result)
                            
                            # Log to Excel with image path
                            self._append_log(image_path)
                            
                            print(f"Captured and evaluated: {result} | OK: {self.ok_count} | NOT OK: {self.not_ok_count}")
                        
                        # Keep window open until wire is removed
                        cv2.imshow("Evaluation Result", eval_display)
                        self.eval_window_open = True
            elif key == ord('r'):
                tmp = cv2.selectROI("Connector Detection", frame, False, False)
                if tmp[2] > 10 and tmp[3] > 10:
                    self.roi_box = (int(tmp[0]), int(tmp[1]), int(tmp[2]), int(tmp[3]))
                    self.use_center_roi = False
            elif key == ord('c'):
                self.roi_box = None
                self.use_center_roi = True
            elif key in (ord('2'), ord('+')):
                self.ZOOM_LEVEL = min(5, self.ZOOM_LEVEL + 1)
            elif key in (ord('1'), ord('-')):
                self.ZOOM_LEVEL = max(1, self.ZOOM_LEVEL - 1)
        
        self.cleanup()
    
    def stop(self):
        """Stop the detection"""
        self.running = False
    
    def cleanup(self):
        """Clean up resources"""
        if self.cap is not None:
            self.cap.release()
        if self.gui_available:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass
    
    def get_counts(self):
        """Get current OK and NOT OK counts"""
        return self.ok_count, self.not_ok_count


if __name__ == "__main__":
    detector = ConnectorDetector()
    detector.run()
