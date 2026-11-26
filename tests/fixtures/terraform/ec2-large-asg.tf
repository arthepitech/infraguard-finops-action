resource "aws_launch_template" "app_asg_lt" {
  name_prefix   = "app-"
  image_id      = "ami-0c55b159cbfafe1f0"
  instance_type = "m5.4xlarge"
}

resource "aws_autoscaling_group" "app_asg" {
  min_size = 1
  max_size = 5

  launch_template {
    id      = aws_launch_template.app_asg_lt.id
    version = "$Latest"
  }
}

resource "aws_instance" "fixed_big" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "m5.4xlarge"

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 50
  }
}
