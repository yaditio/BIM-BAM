"""
FastMCP Server for BIM BAM 3D BIM Viewer & Engineering Intelligence
Exposes every function inside the BIM BAM app as callable FastMCP tools.
"""

from typing import List, Optional, Dict, Any
import requests
import json
import os
import sys

try:
    from fastmcp import FastMCP
except ImportError:
    print("FastMCP is not installed. Run: pip install fastmcp", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("BIM-BAM-Viewer")

SERVER_URL = os.environ.get("BIM_BAM_SERVER_URL", "http://localhost:5000")

def call_bim_bam(tool: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Relays tool call to the running BIM BAM Express server and Xeokit frontend."""
    try:
        resp = requests.post(
            f"{SERVER_URL}/api/mcp/call",
            json={"tool": tool, "args": args or {}},
            timeout=8
        )
        if resp.status_code == 200:
            return resp.json()
        return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "Could not connect to BIM BAM Express server at http://localhost:5000. Ensure 'npm run dev' or 'node server.cjs' is running."
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# ==============================================================================
# 1. 3D Model Elements & Selection Tools
# ==============================================================================

@mcp.tool()
def get_all_objects() -> Dict[str, Any]:
    """Get a list of all object IDs, types (classes), and names in the currently loaded models."""
    return call_bim_bam("get_all_objects")

@mcp.tool()
def get_object_metadata(object_id: str) -> Dict[str, Any]:
    """Get detailed IFC property sets and parameter values for a specific element ID."""
    return call_bim_bam("get_object_metadata", {"objectId": object_id})

@mcp.tool()
def select_objects(object_ids: List[str]) -> Dict[str, Any]:
    """Select one or more objects by their IDs in the 3D viewer. Pass empty list to clear."""
    return call_bim_bam("select_objects", {"objectIds": object_ids})

@mcp.tool()
def hide_objects(object_ids: List[str]) -> Dict[str, Any]:
    """Hide one or more objects by their IDs."""
    return call_bim_bam("hide_objects", {"objectIds": object_ids})

@mcp.tool()
def show_all_objects() -> Dict[str, Any]:
    """Make all hidden objects visible again."""
    return call_bim_bam("show_all_objects")

@mcp.tool()
def isolate_objects(object_ids: List[str]) -> Dict[str, Any]:
    """Isolate one or more objects (makes them visible, hides all other objects)."""
    return call_bim_bam("isolate_objects", {"objectIds": object_ids})

@mcp.tool()
def highlight_objects(object_ids: List[str], highlight: bool = True) -> Dict[str, Any]:
    """Highlight or clear highlight on specified objects."""
    return call_bim_bam("highlight_objects", {"objectIds": object_ids, "highlight": highlight})

@mcp.tool()
def xray_objects(object_ids: List[str], xray: bool = True) -> Dict[str, Any]:
    """Set X-Ray semi-transparent rendering mode for one or more objects."""
    return call_bim_bam("xray_objects", {"objectIds": object_ids, "xray": xray})

@mcp.tool()
def colorize_objects(object_ids: List[str], color: str = "#38bdf8") -> Dict[str, Any]:
    """Colorize specific 3D elements with a custom hex color (e.g. #ff0000, #38bdf8)."""
    return call_bim_bam("colorize_objects", {"objectIds": object_ids, "color": color})

@mcp.tool()
def reset_object_colors(object_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """Reset object colors back to default materials."""
    return call_bim_bam("reset_object_colors", {"objectIds": object_ids or []})

@mcp.tool()
def fly_to_objects(object_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """Fly camera to fit the bounding box of specified object IDs (or fly to whole model if empty)."""
    return call_bim_bam("fly_to_objects", {"objectIds": object_ids or []})

# ==============================================================================
# 2. Camera Navigation, Views & Theme Tools
# ==============================================================================

@mcp.tool()
def set_camera_view(view: str) -> Dict[str, Any]:
    """Navigate camera to standard viewpoint preset ('top', 'bottom', 'front', 'back', 'left', 'right', 'isometric')."""
    return call_bim_bam("set_camera_view", {"view": view})

@mcp.tool()
def set_camera_projection(projection: str) -> Dict[str, Any]:
    """Switch 3D camera projection between 'perspective' and 'ortho'."""
    return call_bim_bam("set_camera_projection", {"projection": projection})

@mcp.tool()
def get_camera_state() -> Dict[str, Any]:
    """Get current camera eye, look, up coordinates and projection."""
    return call_bim_bam("get_camera_state")

@mcp.tool()
def set_camera_state(eye: List[float], look: List[float], up: Optional[List[float]] = None) -> Dict[str, Any]:
    """Move camera to custom eye, look, and up coordinates."""
    return call_bim_bam("set_camera_state", {"eye": eye, "look": look, "up": up or [0, 1, 0]})

@mcp.tool()
def set_viewer_theme(theme: str) -> Dict[str, Any]:
    """Switch application UI theme between 'dark' and 'light'."""
    return call_bim_bam("set_viewer_theme", {"theme": theme})

@mcp.tool()
def set_sun_position(date_time: Optional[str] = None, sky_color: Optional[str] = None, ground_color: Optional[str] = None, enabled: bool = True) -> Dict[str, Any]:
    """Control solar position simulation and directional lighting."""
    return call_bim_bam("set_sun_position", {
        "dateTime": date_time,
        "skyColor": sky_color,
        "groundColor": ground_color,
        "enabled": enabled
    })

# ==============================================================================
# 3. Search, Filter & Parameter Update Tools
# ==============================================================================

@mcp.tool()
def search_objects_by_text(query: str) -> Dict[str, Any]:
    """Search for objects matching text string across names, classes, IDs, and property values."""
    return call_bim_bam("search_objects_by_text", {"query": query})

@mcp.tool()
def apply_property_filter(property_name: str, operator: str, property_value: str) -> Dict[str, Any]:
    """Filter objects by property query criteria (operator: 'equals', 'contains', 'gt', 'lt')."""
    return call_bim_bam("apply_property_filter", {
        "propertyName": property_name,
        "operator": operator,
        "propertyValue": property_value
    })

@mcp.tool()
def reset_property_filter() -> Dict[str, Any]:
    """Reset active property query filters."""
    return call_bim_bam("reset_property_filter")

@mcp.tool()
def update_object_parameter(object_id: str, parameter_name: str, new_value: str) -> Dict[str, Any]:
    """Update parameter/property value for an object in memory and recalculate quantities."""
    return call_bim_bam("update_object_parameter", {
        "objectId": object_id,
        "parameterName": parameter_name,
        "newValue": new_value
    })

# ==============================================================================
# 4. Section Cutting & Measurement Tools
# ==============================================================================

@mcp.tool()
def add_section_plane(cut_type: str = "center", pos: Optional[List[float]] = None, dir_vector: Optional[List[float]] = None) -> Dict[str, Any]:
    """Create a cutting section plane ('center' or 'surface')."""
    return call_bim_bam("add_section_plane", {"type": cut_type, "pos": pos, "dir": dir_vector})

@mcp.tool()
def clear_section_planes() -> Dict[str, Any]:
    """Clear all section cutting planes."""
    return call_bim_bam("clear_section_planes")

@mcp.tool()
def set_measurement_mode(mode: str) -> Dict[str, Any]:
    """Activate measurement tool ('distance', 'angle', 'area', 'spotelev', 'multiline', 'none')."""
    return call_bim_bam("set_measurement_mode", {"mode": mode})

@mcp.tool()
def clear_all_measurements() -> Dict[str, Any]:
    """Clear all measurements drawn on the canvas."""
    return call_bim_bam("clear_all_measurements")

# ==============================================================================
# 5. Quantity Takeoff (QTO) & 5D BOQ (Costing) Tools
# ==============================================================================

@mcp.tool()
def get_qto_summary() -> Dict[str, Any]:
    """Get extracted Quantity Takeoff summary (volumes, areas, lengths, counts) for all elements."""
    return call_bim_bam("get_qto_summary")

@mcp.tool()
def get_element_qto(object_id: str) -> Dict[str, Any]:
    """Get Quantity Takeoff parameters for a specific element ID."""
    return call_bim_bam("get_element_qto", {"objectId": object_id})

@mcp.tool()
def get_boq_items() -> Dict[str, Any]:
    """Fetch all 5D Bill of Quantities items with unit prices and totals."""
    return call_bim_bam("get_boq_items")

@mcp.tool()
def calculate_project_cost() -> Dict[str, Any]:
    """Calculate total estimated project construction budget from BOQ database."""
    return call_bim_bam("calculate_project_cost")

@mcp.tool()
def search_ahsp_catalog(query: str) -> Dict[str, Any]:
    """Search Indonesian AHSP price unit analysis database by keyword."""
    return call_bim_bam("search_ahsp_catalog", {"query": query})

# ==============================================================================
# 6. IFC 4D Construction Scheduling & Simulation Tools
# ==============================================================================

@mcp.tool()
def get_schedule_tasks() -> Dict[str, Any]:
    """Get all 4D construction schedule tasks and timeline information."""
    return call_bim_bam("get_schedule_tasks")

@mcp.tool()
def create_schedule_task(
    work_desc: str,
    start_date: str,
    end_date: str,
    resource_id: Optional[str] = None,
    resource_desc: Optional[str] = None,
    resource_count: int = 1,
    color: str = "#38bdf8",
    predecessor: Optional[str] = None,
    progress: int = 0,
    element_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Create a new 4D construction task linked to 3D elements and labor resources."""
    return call_bim_bam("create_schedule_task", {
        "workDesc": work_desc,
        "startDate": start_date,
        "endDate": end_date,
        "resourceId": resource_id or "",
        "resourceDesc": resource_desc or "",
        "resourceCount": resource_count,
        "color": color,
        "predecessor": predecessor or "",
        "progress": progress,
        "elementIds": element_ids or []
    })

@mcp.tool()
def update_schedule_task(
    task_id: str,
    progress: Optional[int] = None,
    work_desc: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """Update an existing construction schedule task."""
    updates: Dict[str, Any] = {"taskId": task_id}
    if progress is not None:
        updates["progress"] = progress
    if work_desc is not None:
        updates["workDesc"] = work_desc
    if start_date is not None:
        updates["startDate"] = start_date
    if end_date is not None:
        updates["endDate"] = end_date
    return call_bim_bam("update_schedule_task", updates)

@mcp.tool()
def delete_schedule_task(task_id: str) -> Dict[str, Any]:
    """Delete a construction schedule task by task ID."""
    return call_bim_bam("delete_schedule_task", {"taskId": task_id})

@mcp.tool()
def set_schedule_today(today_date: str) -> Dict[str, Any]:
    """Set reference 'Today' date (YYYY-MM-DD) for progress monitoring line on Gantt chart."""
    return call_bim_bam("set_schedule_today", {"todayDate": today_date})

@mcp.tool()
def toggle_chronology_simulation(enabled: Optional[bool] = None) -> Dict[str, Any]:
    """Toggle 4D Chronology simulation mode on or off."""
    return call_bim_bam("toggle_chronology_simulation", {"enabled": enabled})

@mcp.tool()
def set_chronology_simulation_date(date: str) -> Dict[str, Any]:
    """Scrub 4D chronology timeline to specific date and update 3D elements appearance."""
    return call_bim_bam("set_chronology_simulation_date", {"date": date})

@mcp.tool()
def save_schedule_draft() -> Dict[str, Any]:
    """Export schedule draft as JSON containing element GlobalIDs."""
    return call_bim_bam("save_schedule_draft")

@mcp.tool()
def export_schedule_ods() -> Dict[str, Any]:
    """Export schedule to LibreOffice Calc spreadsheet (.ods)."""
    return call_bim_bam("export_schedule_ods")

@mcp.tool()
def export_schedule_ifc() -> Dict[str, Any]:
    """Export schedule to Open Planner Studio IFC4X3 format."""
    return call_bim_bam("export_schedule_ifc")

# ==============================================================================
# 7. Model Auditing & Analysis Tools (Diff & Clash)
# ==============================================================================

@mcp.tool()
def get_loaded_models() -> Dict[str, Any]:
    """Get list of all loaded model files in the session."""
    return call_bim_bam("get_loaded_models")

@mcp.tool()
def run_ifc_diff(old_model_id: str, new_model_id: str) -> Dict[str, Any]:
    """Compare two loaded IFC models using IfcOpenShell IfcDiff."""
    return call_bim_bam("run_ifc_diff", {"oldModelId": old_model_id, "newModelId": new_model_id})

@mcp.tool()
def run_clash_detection(model_a_id: str, model_b_id: Optional[str] = None, tolerance: float = 0.0) -> Dict[str, Any]:
    """Run geometric clash detection within a model or between two models."""
    return call_bim_bam("run_clash_detection", {
        "modelAId": model_a_id,
        "modelBId": model_b_id,
        "tolerance": tolerance
    })

# ==============================================================================
# Main Entry Point
# ==============================================================================

if __name__ == "__main__":
    print("[FastMCP] Starting BIM BAM FastMCP Server...", file=sys.stderr)
    mcp.run()
