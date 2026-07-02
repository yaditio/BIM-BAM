import sys
import os
import json
import zipfile
import uuid
import xml.etree.ElementTree as ET
import ifcopenshell
from ifcdiff import IfcDiff
from ifcclash.ifcclash import Clasher, ClashSettings

def find_elem_by_tag(parent, tag):
    for elem in parent.iter():
        if elem.tag.split('}')[-1] == tag:
            return elem
    return None

def find_elems_by_tag(parent, tag):
    results = []
    for elem in parent.iter():
        if elem.tag.split('}')[-1] == tag:
            results.append(elem)
    return results

def handle_diff(old_path, new_path):
    try:
        old_model = ifcopenshell.open(old_path)
        new_model = ifcopenshell.open(new_path)
        
        # Compare models focusing on geometry and properties
        diff_runner = IfcDiff(
            old=old_model,
            new=new_model,
            relationships=["geometry", "attributes", "property"],
            is_shallow=True
        )
        diff_runner.diff()
        
        added_guids = [el.GlobalId for el in diff_runner.added_elements if hasattr(el, "GlobalId") and el.GlobalId]
        deleted_guids = [el.GlobalId for el in diff_runner.deleted_elements if hasattr(el, "GlobalId") and el.GlobalId]
        
        # Extract changed guids
        changed_guids = list(diff_runner.change_register.keys())
        
        result = {
            "success": True,
            "added": added_guids,
            "deleted": deleted_guids,
            "changed": changed_guids
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def handle_bcf_read(bcf_path, public_snapshot_dir):
    try:
        if not os.path.exists(public_snapshot_dir):
            os.makedirs(public_snapshot_dir, exist_ok=True)
            
        topics = []
        with zipfile.ZipFile(bcf_path, 'r') as archive:
            namelist = archive.namelist()
            topic_folders = set()
            for name in namelist:
                parts = name.split('/')
                if len(parts) >= 2 and (parts[-1].lower() == 'markup.bcf' or parts[-1].lower() == 'markup.xml'):
                    topic_folders.add('/'.join(parts[:-1]))
            
            for folder in topic_folders:
                folder_prefix = folder + '/' if folder else ''
                
                markup_entry = next((n for n in namelist if n.lower() == (folder_prefix + 'markup.bcf').lower() or n.lower() == (folder_prefix + 'markup.xml').lower()), None)
                if not markup_entry:
                    continue
                
                markup_data = archive.read(markup_entry)
                markup_root = ET.fromstring(markup_data)
                
                topic_elem = find_elem_by_tag(markup_root, "Topic")
                if topic_elem is None:
                    continue
                
                topic_guid = topic_elem.attrib.get("Guid", str(uuid.uuid4()))
                title_elem = find_elem_by_tag(topic_elem, "Title")
                desc_elem = find_elem_by_tag(topic_elem, "Description")
                status_elem = topic_elem.attrib.get("TopicStatus") or topic_elem.attrib.get("Status") or "Open"
                
                title = title_elem.text if title_elem is not None else "Untitled Issue"
                description = desc_elem.text if desc_elem is not None else ""
                
                comments = []
                comment_elems = find_elems_by_tag(markup_root, "Comment")
                for c_el in comment_elems:
                    c_guid = c_el.attrib.get("Guid")
                    c_text_el = find_elem_by_tag(c_el, "Comment")
                    c_author_el = find_elem_by_tag(c_el, "Author")
                    c_date_el = find_elem_by_tag(c_el, "Date")
                    
                    comments.append({
                        "guid": c_guid,
                        "text": c_text_el.text if c_text_el is not None else "",
                        "author": c_author_el.text if c_author_el is not None else "Anonymous",
                        "date": c_date_el.text if c_date_el is not None else ""
                    })
                
                viewpoint_data = {}
                viewpoint_entry = next((n for n in namelist if n.lower() == (folder_prefix + 'viewpoint.bcfv').lower() or n.lower() == (folder_prefix + 'viewpoint.xml').lower()), None)
                
                if viewpoint_entry:
                    vp_data = archive.read(viewpoint_entry)
                    vp_root = ET.fromstring(vp_data)
                    
                    camera_types = ["PerspectiveCamera", "OrthographicCamera"]
                    camera_elem = None
                    for ct in camera_types:
                        camera_elem = find_elem_by_tag(vp_root, ct)
                        if camera_elem is not None:
                            break
                    
                    if camera_elem is not None:
                        eye_el = find_elem_by_tag(camera_elem, "CameraViewPoint")
                        dir_el = find_elem_by_tag(camera_elem, "CameraDirection")
                        up_el = find_elem_by_tag(camera_elem, "CameraUpVector")
                        
                        if eye_el is not None:
                            viewpoint_data["eye"] = {
                                "x": float(find_elem_by_tag(eye_el, "X").text or 0),
                                "y": float(find_elem_by_tag(eye_el, "Y").text or 0),
                                "z": float(find_elem_by_tag(eye_el, "Z").text or 0),
                            }
                        if dir_el is not None:
                            viewpoint_data["dir"] = {
                                "x": float(find_elem_by_tag(dir_el, "X").text or 0),
                                "y": float(find_elem_by_tag(dir_el, "Y").text or 0),
                                "z": float(find_elem_by_tag(dir_el, "Z").text or 0),
                            }
                        if up_el is not None:
                            viewpoint_data["up"] = {
                                "x": float(find_elem_by_tag(up_el, "X").text or 0),
                                "y": float(find_elem_by_tag(up_el, "Y").text or 0),
                                "z": float(find_elem_by_tag(up_el, "Z").text or 0),
                            }
                    
                    components = []
                    comp_elems = find_elems_by_tag(vp_root, "Component")
                    for comp_el in comp_elems:
                        guid = comp_el.attrib.get("IfcGuid")
                        if guid:
                            components.append(guid)
                    
                    viewpoint_data["components"] = components
                
                snapshot_name = None
                snapshot_entry = next((n for n in namelist if n.lower() == (folder_prefix + 'snapshot.png').lower() or n.lower() == (folder_prefix + 'snapshot.jpg').lower()), None)
                if snapshot_entry:
                    ext = snapshot_entry.split('.')[-1]
                    snapshot_filename = f"{topic_guid}.{ext}"
                    snapshot_dest = os.path.join(public_snapshot_dir, snapshot_filename)
                    with open(snapshot_dest, 'wb') as img_out:
                        img_out.write(archive.read(snapshot_entry))
                    snapshot_name = snapshot_filename
                
                topics.append({
                    "guid": topic_guid,
                    "title": title,
                    "description": description,
                    "status": status_elem,
                    "comments": comments,
                    "viewpoint": viewpoint_data,
                    "snapshot": snapshot_name
                })
                
        print(json.dumps({"success": True, "topics": topics}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def handle_clash(file_a, file_b=None, tolerance=0.0, output_bcf="clashes.bcf"):
    try:
        settings = ClashSettings()
        json_output = output_bcf.replace(".bcf", ".json")
        settings.output = json_output
        
        clash_set = {
            "name": "Clash Detection Set",
            "mode": "collision",
            "check_all": True,
            "allow_touching": False,
            "tolerance": float(tolerance),
            "clearance": 0.0,
            "a": [{"file": file_a}]
        }
        if file_b:
            clash_set["b"] = [{"file": file_b}]
            
        clasher = Clasher(settings)
        clasher.clash_sets = [clash_set]
        clasher.clash()
        
        settings.output = output_bcf
        clasher.export_bcfxml()
        
        clash_results = []
        for clash_set_res in clasher.clash_sets:
            for clash in clash_set_res.get("clashes", {}).values():
                clash_results.append({
                    "a_guid": clash.get("a_global_id"),
                    "b_guid": clash.get("b_global_id"),
                    "a_name": clash.get("a_name"),
                    "b_name": clash.get("b_name"),
                    "a_class": clash.get("a_ifc_class"),
                    "b_class": clash.get("b_ifc_class"),
                    "point": clash.get("p1", [0, 0, 0])
                })
                
        if os.path.exists(json_output):
            try:
                os.remove(json_output)
            except:
                pass
                
        print(json.dumps({"success": True, "clashes": clash_results, "bcf_file": os.path.basename(output_bcf)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Insufficient arguments"}))
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "diff":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: diff <old_file> <new_file>"}))
            sys.exit(1)
        handle_diff(sys.argv[2], sys.argv[3])
    elif cmd == "bcf-read":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: bcf-read <bcf_file> <snapshot_dir>"}))
            sys.exit(1)
        handle_bcf_read(sys.argv[2], sys.argv[3])
    elif cmd == "clash":
        file_a = sys.argv[2]
        file_b = None
        tolerance = 0.0
        output_bcf = "clashes.bcf"
        
        args = sys.argv[3:]
        i = 0
        if len(args) > 0 and not args[0].startswith("--"):
            file_b = args[0]
            args = args[1:]
            
        while i < len(args):
            if args[i] == "--tolerance":
                tolerance = float(args[i+1])
                i += 2
            elif args[i] == "--output":
                output_bcf = args[i+1]
                i += 2
            else:
                i += 1
                
        handle_clash(file_a, file_b, tolerance, output_bcf)
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {cmd}"}))
