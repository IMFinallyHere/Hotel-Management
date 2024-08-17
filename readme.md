
# Hotel Management
After doing a lot of reserch I couldn't find a hotel management software for my hotel. Hence decided to make one myself. Though not sure if I would be able to ever complete and lauch it 😜.


## Rooms
- Number of beds in a room  = Number of customers a room can occupy. But more people can be accommodated by adding extra beds to a room. 
- Room prices can be determined in 3 ways:
    - room prices can be defined datewise in *RoomsPriceChart*.
    - if room prices are not present in *RoomsPriceChart*, then if will be picked using default price *(defined while creating a room)*.
    - At the time of give room to a customers.
- Rooms are always given to a group. More info can be found [here](#gc).


## Groups and Customers {#gc}
This group concept came into picture to solve one issue. 

Issue:
| Group | No. of Customers | Room | Check-in | Check-out |
| ----- | ---------------- | ---- | -------- | --------- |
|1.|4|101|6:00|12:00|
|2.|3|101|13:00|20:00|

Now if we see that the same room has been occupied but two different group of people on same date. So to find who stayed with whom on a particular date, I have introduced this group concept.

This is straigt forward, a group consist of one or more no. customer. Whenever one or more customers want to check-in into a room, always a new group is created and connected with that room on that date and time.
## Configuration
- Here we can store a key and its value. These keys will always be defined by the **developer**. All the validation based on keys will be written at code level.

Example:
Here we are setting the price of extra bed.
- key = extra_bed_price, value=500
